/**
 * POST /api/generaciones/lote: paso 1 de la compuerta de LOTE (regla dura #3, ADR-032).
 *
 * Estima las escenas de un lote de motos — UNA por moto, cada una de 1 o 2 imágenes — y las
 * guarda como un lote 'estimado' con N generaciones 'estimada' que vencen a los 15 minutos.
 * Calcula todo EN EL SERVIDOR (el precio jamás se lee del cliente) y no llama a Gemini ni
 * gasta nada. El total que ve la persona es la suma de los topes de las N imágenes.
 */

import { error, responder, UUID } from '../../agentes/http.ts'
import { ORGANIZACION_PILOTO_ID } from '../../organizacion.ts'
import { faltaPedidoDeFondo, MENSAJE_FALTA_DESCRIPCION, promptEscena, VERSION_PROMPT_ESCENA } from '../../promocion/escena.ts'
import { gruposDeTanda } from '../../promocion/lote/grupos.ts'
import { LIMITES_LOTE } from '../../promocion/lote/tipos.ts'
import { compartenEscena, pedidoEscenaDe } from '../../promocion/tanda/escena.ts'
import { combinacionValida, esFondo, esPlantilla, MENSAJE_COSTADO_SIN_LADO, type IdFondo, type IdPlantilla, type PosicionMoto } from '../../promocion/tipos.ts'
import { ErrorSupabase, rpc, seleccionar, type Supabase } from '../../supabase/rest.ts'
import { autorizarProductor } from '../autorizar.ts'
import { escenaUsada, VIGENCIA_ESTIMACION_MS } from '../estimacion.ts'
import { estimarImagenes, PRECIOS_IMAGEN, tienePrecioImagen } from '../precios.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

type Hija = {
  id: string
  estado: string
  modelo: string
  marca_id: string
  grupo: number | null
  variante: number | null
  foto_id: string
  aspecto: string
  plantilla: string | null
  fondo: string | null
  fondo_descripcion: string | null
  posicion_moto: PosicionMoto
  inspiracion_foto_id: string | null
}

const redondear = (n: number) => Math.round(n * 1e6) / 1e6

/** Un 422 que dice de qué moto habla (la pantalla lo muestra en esa moto). */
const rechazoDeMoto = (grupo: number, modelo: string, mensaje: string, extra: Record<string, unknown> = {}) =>
  responder({ error: `Moto ${grupo} (${modelo}): ${mensaje}`, grupo, modelo, ...extra }, 422)

/** Fotos que tienen que existir y estar vivas: devuelve la respuesta de error o null si está bien. */
async function revisarFotos(supabase: Supabase, ids: readonly string[], uso: 'moto' | 'inspiracion', f: Fetch): Promise<Response | null> {
  if (ids.length === 0) return null
  const fotos = await seleccionar<{ id: string; ruta: string | null; borrada_en: string | null }>(
    supabase,
    'fotos',
    { select: 'id,ruta,borrada_en', id: `in.(${ids.join(',')})`, uso: `eq.${uso}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}` },
    f,
  )
  const que = uso === 'moto' ? 'la foto de la moto' : 'la foto de inspiración'
  if (ids.some((id) => !fotos.some((x) => x.id === id))) return error(`No se encontró ${que}.`, 404)
  if (fotos.some((x) => x.borrada_en !== null || x.ruta === null)) {
    return error(uso === 'moto' ? 'Alguna foto se borró: subí otra.' : 'La foto de inspiración se borró: sacala o subí otra.', 410)
  }
  return null
}

export async function manejarEstimacionLote(request: Request, entorno: Entorno, f: Fetch, ahora: () => number = Date.now): Promise<Response> {
  const ctx = await autorizarProductor(request, entorno, 'generar imágenes', f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase, topeUsd, motorPorDefecto } = ctx

  // Solo se leen estas cuatro claves: el resto (precios incluidos) se descarta.
  const cuerpo = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (cuerpo === null || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return error('El pedido no es válido.', 400)
  const { tandaId, variantes } = cuerpo
  if (typeof tandaId !== 'string' || !UUID.test(tandaId)) return error('Falta la tanda.', 400)
  if (typeof variantes !== 'number' || !Number.isInteger(variantes) || variantes < 1 || variantes > LIMITES_LOTE.VARIANTES_IMAGEN) {
    return error(`Las variantes por moto tienen que ser 1 o ${LIMITES_LOTE.VARIANTES_IMAGEN}.`, 400)
  }
  const motor = cuerpo.motor === undefined ? motorPorDefecto : cuerpo.motor
  if (typeof motor !== 'string' || !tienePrecioImagen(motor)) {
    return error(`Motor desconocido. Los disponibles: ${Object.keys(PRECIOS_IMAGEN).join(', ')}.`, 400)
  }
  let pedidos: number[] | null = null
  if (cuerpo.grupos !== undefined) {
    const g = cuerpo.grupos
    if (!Array.isArray(g) || g.length === 0 || g.length > LIMITES_LOTE.MOTOS || g.some((x) => typeof x !== 'number' || !Number.isInteger(x) || x < 1 || x > LIMITES_LOTE.MOTOS)) {
      return error('Las motos a estimar tienen que ser números de 1 a 10.', 400)
    }
    pedidos = [...new Set(g as number[])]
  }

  try {
    const org = { organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}` }
    const [tanda] = await seleccionar<{ id: string; tipo: string }>(supabase, 'tandas_promocion', { select: 'id,tipo', id: `eq.${tandaId}`, ...org, limit: '1' }, f)
    if (!tanda) return error('No se encontró la tanda.', 404)
    if (tanda.tipo !== 'motos') return error('Esta tanda no es un lote de motos: usá Ver precio de la tanda.', 422)

    const hijas = (
      await seleccionar<Hija>(
        supabase,
        'promociones',
        {
          select: 'id,estado,modelo,marca_id,grupo,variante,foto_id,aspecto,plantilla,fondo,fondo_descripcion,posicion_moto,inspiracion_foto_id',
          tanda_id: `eq.${tandaId}`,
          ...org,
          order: 'creado_en.asc,id.asc',
        },
        f,
      )
    ).filter((h) => h.estado !== 'descartada')
    if (hijas.length === 0) return error('No se encontró la tanda.', 404)
    if (hijas.some((h) => h.estado !== 'borrador')) return error('Alguna promoción de la tanda ya no es un borrador.', 409)
    if (hijas.some((h) => h.grupo === null)) return error('Esta tanda no es un lote de motos: usá Ver precio de la tanda.', 422)

    const todos = gruposDeTanda(hijas)
    const grupos = pedidos === null ? todos : todos.filter((g) => pedidos.includes(g.grupo!))
    if (pedidos !== null && grupos.length !== pedidos.length) return error('No se encontró alguna de esas motos.', 404)

    // Cada moto se valida sola: su diseño, su fondo y que sus marcas pidan la misma escena.
    for (const g of grupos) {
      const n = g.grupo!
      const primera = g.hijas[0]!
      if (g.hijas.some((h) => !esPlantilla(h.plantilla) || !esFondo(h.fondo))) return rechazoDeMoto(n, g.modelo, 'Elegí un diseño primero.')
      if (!combinacionValida(primera.plantilla as IdPlantilla, primera.posicion_moto)) return rechazoDeMoto(n, g.modelo, MENSAJE_COSTADO_SIN_LADO)
      if (faltaPedidoDeFondo(primera.fondo as IdFondo, primera.fondo_descripcion, primera.inspiracion_foto_id !== null)) {
        return rechazoDeMoto(n, g.modelo, MENSAJE_FALTA_DESCRIPCION)
      }
      const comparten = compartenEscena(g.hijas)
      if (!comparten.ok) {
        return rechazoDeMoto(n, g.modelo, `las marcas no piden la misma imagen: difiere ${comparten.difieren.join(', ')}. Igualalas.`, { difieren: comparten.difieren })
      }
    }

    const fotoIds = [...new Set(grupos.map((g) => g.hijas[0]!.foto_id))]
    const refIds = [...new Set(grupos.flatMap((g) => (g.hijas[0]!.inspiracion_foto_id ? [g.hijas[0]!.inspiracion_foto_id] : [])))]
    const mala = (await revisarFotos(supabase, fotoIds, 'moto', f)) ?? (await revisarFotos(supabase, refIds, 'inspiracion', f))
    if (mala) return mala

    const items = grupos.map((g) => {
      const h = g.hijas[0]!
      const conReferencia = h.inspiracion_foto_id !== null
      const e = estimarImagenes(motor, variantes, { conFoto: true, conReferencia })
      return {
        motor,
        prompt: promptEscena(pedidoEscenaDe(h)),
        parametros: {
          aspecto: h.aspecto,
          image_size: '1K',
          mime_type: 'image/jpeg',
          thinking: PRECIOS_IMAGEN[motor]!.pensamiento,
          escena: escenaUsada(h.fondo as IdFondo, h.fondo_descripcion, h.inspiracion_foto_id, h.posicion_moto),
        },
        cantidad: variantes,
        aspecto: h.aspecto,
        fotoId: h.foto_id,
        ...(conReferencia ? { referenciaFotoId: h.inspiracion_foto_id } : {}),
        grupo: g.grupo,
        versionPrompt: VERSION_PROMPT_ESCENA,
        // Lo que se guarda y se compara con el tope es el TOPE por imagen (conservador).
        costoEstimadoUsd: e.topeTotalUsd,
      }
    })
    const totalUsd = redondear(items.reduce((t, i) => t + i.costoEstimadoUsd, 0))
    const venceEn = new Date(ahora() + VIGENCIA_ESTIMACION_MS).toISOString()

    const creado = await rpc<{ loteId: string; items: { generacionId: string; grupo: number | null; costoEstimadoUsd: number }[] }>(
      supabase,
      'crear_lote_generacion',
      { p_org: ORGANIZACION_PILOTO_ID, p_tanda: tandaId, p_promocion: null, p_items: items, p_vence: venceEn, p_usuario: usuarioId },
      f,
    )
    const gastadoUsd = Number(await rpc<number>(supabase, 'gasto_generaciones_mes', { p_org: ORGANIZACION_PILOTO_ID }, f)) || 0
    const modeloDe = new Map(todos.map((g) => [g.grupo, g.modelo]))

    return responder(
      {
        lote: {
          id: creado.loteId,
          costoEstimadoUsd: totalUsd,
          items: creado.items.map((i) => ({ generacionId: i.generacionId, grupo: i.grupo, modelo: modeloDe.get(i.grupo) ?? '', costoEstimadoUsd: Number(i.costoEstimadoUsd) })),
          venceEn,
        },
        mes: { gastadoUsd, topeUsd },
        excedeTope: gastadoUsd + totalUsd > topeUsd,
      },
      201,
    )
  } catch (err) {
    if (err instanceof ErrorSupabase) {
      // PostgREST traduce PT404 → 404 y 22023 → 400.
      if (err.status === 404) return error('No se encontró la tanda.', 404)
      if (err.status === 400) return error('El lote no es válido: revisá las motos.', 400)
    }
    console.error('lote: falló la estimación', err instanceof ErrorSupabase ? err.message : 'error interno')
    return error('No se pudo preparar la estimación del lote. Probá de nuevo en un momento.', 500)
  }
}
