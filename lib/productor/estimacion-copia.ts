/**
 * La rama de COPIA FIEL de la estimación (ADR-040): arma lo propio de la generación (prompt, textos esperados, origen) para una promoción
 * o una tanda de marcas. La compuerta de costo no cambia: el estimado es imágenes + revisión de textos y entra por la misma fila `estimada`.
 * No llama a Gemini ni gasta nada.
 */

import { error, responder } from '../agentes/http.ts'
import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { hashTextos } from '../promocion/copia/hash-textos.ts'
import { prepararCopiaFiel, textosDeLaPromocion, type PedidoCopia, type PromoParaCopia } from '../promocion/copia/pedido.ts'
import { imagenesDeEntradaCopia } from '../promocion/copia/precios.ts'
import { esCopiaFiel } from '../promocion/copia/tipos.ts'
import { esVariasMotos } from '../promocion/varias/tipos.ts'
import { compartenEscena } from '../promocion/tanda/escena.ts'
import { seleccionar, type Supabase } from '../supabase/rest.ts'
import { esAspectoFoto, type AspectoFoto } from './ediciones.ts'
import type { Propio } from './estimacion.ts'

type Fetch = typeof fetch
type Entorno = Record<string, string | undefined>

export type PromoCopia = PromoParaCopia & {
  id: string
  estado: string
  foto_id: string
  aspecto: AspectoFoto
  plantilla: string | null
  inspiracion_foto_id: string | null
}
export type HijaCopia = PromoCopia & { tanda_id?: string | null; grupo?: number | null; fondo: string | null; fondo_descripcion: string | null; posicion_moto: string; inspiracion_modo?: string }

const propioDe = (pedido: PedidoCopia, p: { aspecto: string; origen: Record<string, unknown>; extra: Record<string, unknown>; inspiracionFotoId: string; parametrosExtra?: Record<string, unknown>; /** Las fotos de las otras motos (varias motos en una placa). */ fotosExtra?: readonly string[] }): Propio => ({
  prompt: pedido.prompt,
  version: pedido.version,
  aspecto: p.aspecto,
  origen: p.origen,
  extra: { ...p.extra, copiaFiel: true, conInspiracion: true },
  referenciaFotoId: p.inspiracionFotoId,
  // Las imágenes de entrada: la foto de cada moto y la referencia (con una sola moto, las dos de siempre).
  imagenesEntrada: imagenesDeEntradaCopia(1 + (p.fotosExtra?.length ?? 0)),
  ...(p.parametrosExtra || p.fotosExtra?.length ? { parametrosExtra: { ...p.parametrosExtra, ...(p.fotosExtra?.length ? { fotosExtra: [...p.fotosExtra] } : {}) } } : {}),
  copia: { textos: pedido.textos, hash: pedido.textosHash, modeloVerificacion: pedido.modeloVerificacion },
})

/** La foto de la moto y la de la referencia tienen que existir y estar vivas. null = todo bien. */
async function revisarFotos(supabase: Supabase, fotoId: string, referenciaId: string, f: Fetch): Promise<Response | null> {
  const [ref] = await seleccionar<{ id: string; ruta: string | null; borrada_en: string | null }>(
    supabase,
    'fotos',
    { select: 'id,ruta,borrada_en', id: `eq.${referenciaId}`, uso: 'eq.inspiracion', organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
    f,
  )
  if (!ref) return error('No se encontró la foto de inspiración.', 404)
  if (ref.borrada_en !== null || ref.ruta === null) return error('La foto de inspiración se borró: sacala o subí otra.', 410)
  const [foto] = await seleccionar<{ id: string; ruta: string | null; borrada_en: string | null }>(
    supabase,
    'fotos',
    { select: 'id,ruta,borrada_en', id: `eq.${fotoId}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
    f,
  )
  if (!foto) return error('No se encontró la foto.', 404)
  if (foto.borrada_en !== null || foto.ruta === null) return error('La foto se borró.', 410)
  return null
}

/** Las fotos de las otras motos de una placa de varias motos (ADR-041): de la organización, de moto y vivas. Una sola consulta. null = todo bien. */
async function revisarFotosExtra(supabase: Supabase, ids: readonly string[], f: Fetch): Promise<Response | null> {
  if (ids.length === 0) return null
  const fotos = await seleccionar<{ id: string; ruta: string | null; borrada_en: string | null }>(
    supabase,
    'fotos',
    { select: 'id,ruta,borrada_en', id: `in.(${ids.join(',')})`, uso: 'eq.moto', organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}` },
    f,
  )
  if (ids.some((id) => !fotos.some((x) => x.id === id))) return error('No se encontró la foto de alguna de las motos.', 404)
  if (fotos.some((x) => x.borrada_en !== null || x.ruta === null)) return error('La foto de alguna de las motos se borró: sacala o subí otra.', 410)
  return null
}

const sinPrecioDeVerificacion = (e: unknown) => {
  console.error('copia fiel: no se pudo armar el pedido', e instanceof Error ? e.message : 'error interno')
  return error('No se puede estimar: el modelo que revisa los textos no tiene precio cargado.', 500)
}

/** Una promoción con la plantilla copia_fiel. `formato`: otro tamaño pagado aparte (solo la copia fiel lo admite). */
export async function propioDePromocionCopia(supabase: Supabase, promo: PromoCopia, formato: unknown, entorno: Entorno, f: Fetch): Promise<Response | Propio> {
  const aspecto = formato === undefined || formato === null ? promo.aspecto : esAspectoFoto(formato) ? formato : null
  if (aspecto === null) return error('Ese formato no existe.', 400)
  const esExtra = aspecto !== promo.aspecto
  if (promo.estado !== 'borrador') {
    if (!(promo.estado === 'aprobada' && esExtra)) {
      return error(promo.estado === 'aprobada' ? 'Esta promoción ya está aprobada: solo se puede pedir otro formato distinto del de la placa.' : 'Esta promoción ya no es un borrador.', 409)
    }
  }
  if (promo.inspiracion_foto_id === null) return error('La copia fiel necesita tu foto de referencia.', 422)
  const mala = await revisarFotos(supabase, promo.foto_id, promo.inspiracion_foto_id, f)
  if (mala) return mala
  // Varias motos en una placa (ADR-041): las fotos de las motos 2 a 4, en orden.
  const fotosExtra = esVariasMotos(promo) ? promo.motos_extra!.map((m) => m.fotoId) : []
  const malaExtra = await revisarFotosExtra(supabase, fotosExtra, f)
  if (malaExtra) return malaExtra
  let pedido: PedidoCopia
  try {
    pedido = prepararCopiaFiel(promo, aspecto, entorno)
  } catch (e) {
    return sinPrecioDeVerificacion(e)
  }
  return propioDe(pedido, {
    aspecto,
    origen: { foto_id: promo.foto_id, edicion: 'promocion', promocion_id: promo.id },
    extra: { origen: 'promocion' },
    inspiracionFotoId: promo.inspiracion_foto_id,
    fotosExtra,
    ...(esExtra ? { parametrosExtra: { formatoExtra: true } } : {}),
  })
}

/** Las hijas de una tanda de marcas, alguna con copia fiel: todas tienen que serlo y pedir los MISMOS textos (una sola imagen, un solo cobro). */
export async function propioDeTandaCopia(supabase: Supabase, hijas: readonly HijaCopia[], tandaId: string, entorno: Entorno, f: Fetch): Promise<Response | Propio> {
  const primera = hijas[0]!
  if (hijas.some((h) => !esCopiaFiel(h.plantilla))) return error('La copia fiel se genera de a una promoción o en una tanda donde todas usan la copia fiel: igualá el diseño de las promociones.', 422)
  if (hijas.some((h) => h.grupo != null)) return error('La copia fiel se genera de a una promoción o en una tanda de marcas, no en un lote de motos.', 422)
  const conTextos = hijas.map((h) => ({ ...h, textos_copia: hashTextos(textosDeLaPromocion(h)) }))
  const comparten = compartenEscena(conTextos)
  if (!comparten.ok) {
    return responder(
      { error: `Las promociones de la tanda no piden la misma imagen: difiere ${comparten.difieren.join(', ')}. Igualalos o generá una imagen por promoción.`, difieren: comparten.difieren },
      422,
    )
  }
  if (primera.inspiracion_foto_id === null) return error('La copia fiel necesita tu foto de referencia.', 422)
  const mala = await revisarFotos(supabase, primera.foto_id, primera.inspiracion_foto_id, f)
  if (mala) return mala
  let pedido: PedidoCopia
  try {
    pedido = prepararCopiaFiel(primera, primera.aspecto, entorno)
  } catch (e) {
    return sinPrecioDeVerificacion(e)
  }
  return propioDe(pedido, {
    aspecto: primera.aspecto,
    origen: { foto_id: primera.foto_id, edicion: 'promocion', tanda_id: tandaId },
    extra: { origen: 'tanda', promociones: hijas.length },
    inspiracionFotoId: primera.inspiracion_foto_id,
  })
}
