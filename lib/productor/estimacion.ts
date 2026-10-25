/**
 * POST /api/generaciones: paso 1 de la compuerta (regla dura #3).
 *
 * Calcula la estimación EN EL SERVIDOR y la guarda como fila `estimada` que
 * vence a los 15 minutos. No llama a Gemini ni gasta nada. El precio jamás se
 * lee del cliente: cualquier campo de costo en el body se ignora.
 */

import { error, responder, UUID } from '../agentes/http.ts'
import type { Pieza } from '../contenidista/tipos.ts'
import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { promptEscena, VERSION_PROMPT_ESCENA } from '../promocion/escena.ts'
import { esFondo, esPlantilla, ZONAS, type DatosPromocion } from '../promocion/tipos.ts'
import { ErrorSupabase, insertar, rpc, seleccionar } from '../supabase/rest.ts'
import { autorizarProductor } from './autorizar.ts'
import { esAspectoFoto, esEdicion, type AspectoFoto, type IdEdicion } from './ediciones.ts'
import { estimarImagenes, MAX_IMAGENES, PRECIOS_IMAGEN, tienePrecioImagen } from './precios.ts'
import { aspectoDe, promptFoto, promptImagen, VERSION_PROMPT_FOTO, VERSION_PROMPT_IMAGEN } from './prompt.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

export const VIGENCIA_ESTIMACION_MS = 15 * 60_000

export type Origen =
  | { readonly tipo: 'pieza'; readonly piezaId: string }
  | { readonly tipo: 'foto'; readonly fotoId: string; readonly edicion: IdEdicion; readonly aspecto: AspectoFoto }
  /** La escena de una promoción: foto, fondo, formato y zona libre salen de la promoción, no del pedido. */
  | { readonly tipo: 'promocion'; readonly promocionId: string }

/** De dónde sale la imagen: una pieza aprobada, una foto o una promoción. Más de una (o ninguna) es un pedido inválido. */
export function leerOrigen(cuerpo: Record<string, unknown>): Origen | { readonly error: string } {
  const hayPieza = cuerpo.piezaId !== undefined && cuerpo.piezaId !== null
  const hayFoto = cuerpo.fotoId !== undefined && cuerpo.fotoId !== null
  const hayPromo = cuerpo.promocionId !== undefined && cuerpo.promocionId !== null
  if (hayPromo) {
    if (hayPieza || hayFoto) return { error: 'Mandá una pieza, una foto o una promoción: solo una.' }
    if (typeof cuerpo.promocionId !== 'string' || !UUID.test(cuerpo.promocionId)) return { error: 'Falta la promoción.' }
    return { tipo: 'promocion', promocionId: cuerpo.promocionId }
  }
  if (hayPieza && hayFoto) return { error: 'Mandá una pieza o una foto, no las dos.' }
  if (hayFoto) {
    const { fotoId, edicion, aspecto } = cuerpo
    if (typeof fotoId !== 'string' || !UUID.test(fotoId)) return { error: 'Falta la foto.' }
    if (!esEdicion(edicion)) return { error: 'Esa edición no existe.' }
    if (!esAspectoFoto(aspecto)) return { error: 'Ese formato no existe.' }
    return { tipo: 'foto', fotoId, edicion, aspecto }
  }
  if (typeof cuerpo.piezaId !== 'string' || !UUID.test(cuerpo.piezaId)) return { error: 'Falta la pieza.' }
  return { tipo: 'pieza', piezaId: cuerpo.piezaId }
}

export async function manejarEstimacion(
  request: Request,
  entorno: Entorno,
  f: Fetch,
  ahora: () => number = Date.now,
): Promise<Response> {
  const ctx = await autorizarProductor(request, entorno, 'generar imágenes', f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase, topeUsd, motorPorDefecto } = ctx

  // Solo se leen estas tres claves: el resto (precios incluidos) se descarta.
  const cuerpo = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (cuerpo === null || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return error('El pedido no es válido.', 400)
  const origen = leerOrigen(cuerpo)
  if ('error' in origen) return error(origen.error, 400)
  const { cantidad } = cuerpo
  if (typeof cantidad !== 'number' || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_IMAGENES) {
    return error(`La cantidad tiene que ser un entero entre 1 y ${MAX_IMAGENES}.`, 400)
  }
  const motor = cuerpo.motor === undefined ? motorPorDefecto : cuerpo.motor
  if (typeof motor !== 'string' || !tienePrecioImagen(motor)) {
    return error(`Motor desconocido. Los disponibles: ${Object.keys(PRECIOS_IMAGEN).join(', ')}.`, 400)
  }

  try {
    // Lo propio de cada origen: qué se guarda como origen, el prompt y si lleva foto de entrada.
    let propio: { prompt: string; version: string; aspecto: string; origen: Record<string, unknown>; extra: Record<string, unknown> }
    if (origen.tipo === 'foto') {
      const [foto] = await seleccionar<{ id: string; ruta: string | null; borrada_en: string | null }>(
        supabase,
        'fotos',
        { select: 'id,ruta,borrada_en', id: `eq.${origen.fotoId}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
        f,
      )
      if (!foto) return error('No se encontró la foto.', 404)
      if (foto.borrada_en !== null || foto.ruta === null) return error('La foto se borró.', 410)
      propio = {
        prompt: promptFoto(origen.edicion, origen.aspecto),
        version: VERSION_PROMPT_FOTO,
        aspecto: origen.aspecto,
        origen: { foto_id: foto.id, edicion: origen.edicion },
        extra: { origen: 'foto', edicion: origen.edicion },
      }
    } else if (origen.tipo === 'promocion') {
      const [promo] = await seleccionar<{
        id: string
        estado: string
        foto_id: string
        aspecto: AspectoFoto
        plantilla: string | null
        fondo: string | null
        datos: DatosPromocion
      }>(
        supabase,
        'promociones',
        { select: 'id,estado,foto_id,aspecto,plantilla,fondo,datos', id: `eq.${origen.promocionId}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
        f,
      )
      if (!promo) return error('No se encontró la promoción.', 404)
      if (promo.estado !== 'borrador') return error('Esta promoción ya no es un borrador.', 409)
      if (!esPlantilla(promo.plantilla) || !esFondo(promo.fondo)) return error('Elegí un diseño primero.', 422)
      const [foto] = await seleccionar<{ id: string; ruta: string | null; borrada_en: string | null }>(
        supabase,
        'fotos',
        { select: 'id,ruta,borrada_en', id: `eq.${promo.foto_id}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
        f,
      )
      if (!foto) return error('No se encontró la foto.', 404)
      if (foto.borrada_en !== null || foto.ruta === null) return error('La foto se borró.', 410)
      propio = {
        prompt: promptEscena(promo.fondo, ZONAS[promo.plantilla], promo.aspecto, promo.datos.indicaciones ?? ''),
        version: VERSION_PROMPT_ESCENA,
        aspecto: promo.aspecto,
        origen: { foto_id: foto.id, edicion: 'promocion', promocion_id: promo.id },
        extra: { origen: 'promocion' },
      }
    } else {
      const [fila] = await seleccionar<{ id: string; raiz_id: string; estado: string; pieza: Pieza }>(
        supabase,
        'piezas',
        { select: 'id,raiz_id,estado,pieza', id: `eq.${origen.piezaId}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
        f,
      )
      if (!fila) return error('No se encontró la pieza.', 404)
      if (fila.estado !== 'aprobada') return error('Solo se generan imágenes de piezas aprobadas.', 422)
      const aspecto = aspectoDe(fila.pieza.formato, fila.pieza.plataforma)
      if (!aspecto) return error(`El formato "${fila.pieza.formato}" no genera imágenes: solo imagen, carrusel e historia.`, 422)
      propio = {
        prompt: promptImagen(fila.pieza, aspecto),
        version: VERSION_PROMPT_IMAGEN,
        aspecto,
        origen: { pieza_id: fila.id, pieza_raiz_id: fila.raiz_id },
        extra: {},
      }
    }
    const { aspecto } = propio

    const e = estimarImagenes(motor, cantidad, { conFoto: origen.tipo !== 'pieza' })
    const venceEn = new Date(ahora() + VIGENCIA_ESTIMACION_MS).toISOString()
    const creada = await insertar<{ id: string }>(
      supabase,
      'generaciones',
      {
        organizacion_id: ORGANIZACION_PILOTO_ID,
        tipo: 'imagen',
        motor,
        prompt: propio.prompt,
        parametros: {
          aspecto,
          image_size: '1K',
          mime_type: 'image/jpeg',
          thinking: PRECIOS_IMAGEN[motor]!.pensamiento,
        },
        cantidad,
        aspecto,
        ...propio.origen,
        creado_por: usuarioId,
        version_prompt: propio.version,
        // Lo que se guarda y se compara con el tope es el TOPE por imagen (conservador).
        costo_estimado_usd: e.topeTotalUsd,
        vence_en: venceEn,
      },
      f,
    )
    const gastadoUsd = Number(await rpc<number>(supabase, 'gasto_generaciones_mes', { p_org: ORGANIZACION_PILOTO_ID }, f)) || 0

    return responder(
      {
        id: creada.id,
        costoEstimadoUsd: e.topeTotalUsd,
        generacion: {
          id: creada.id,
          motor,
          cantidad,
          aspecto,
          ...propio.extra,
          porImagenUsd: e.porImagenUsd,
          listaUsd: e.totalUsd,
          costoEstimadoUsd: e.topeTotalUsd,
          venceEn,
        },
        mes: { gastadoUsd, topeUsd },
        excedeTope: gastadoUsd + e.topeTotalUsd > topeUsd,
      },
      201,
    )
  } catch (err) {
    console.error('generaciones: falló', err instanceof ErrorSupabase ? err.message : 'error interno')
    return error('No se pudo preparar la estimación. Probá de nuevo en un momento.', 500)
  }
}
