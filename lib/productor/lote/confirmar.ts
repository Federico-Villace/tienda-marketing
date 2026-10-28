/**
 * POST /api/generaciones/lote/[id]/confirmar: paso 2 de la compuerta de LOTE (regla dura #3).
 *
 * Confirma TODAS las imágenes del lote o NINGUNA, con un solo chequeo del tope mensual sobre
 * el total (confirmar_lote_generacion, atómica). NO llama a Gemini: la ejecución es aparte,
 * una imagen por request (lote/ejecutar.ts). Orden inviolable:
 *   1. autorizar (sesión, rol, GEMINI_API_KEY, tope válido)
 *   2. leer el lote y RECALCULAR el precio de cada imagen en el servidor
 *   3. verificar que las fotos existan y sigan vivas (sin RPC: si falta una no se confirma nada)
 *   4. RPC confirmar_lote_generacion
 * El body se ignora por completo: el cliente no manda precio, tope ni usuario.
 */

import { error, responder, UUID } from '../../agentes/http.ts'
import { ORGANIZACION_PILOTO_ID } from '../../organizacion.ts'
import { ErrorSupabase, rpc, seleccionar, type Supabase } from '../../supabase/rest.ts'
import { autorizarProductor } from '../autorizar.ts'
import { redondear } from '../ejecutar.ts'
import { estimarImagenes, MAX_IMAGENES, tienePrecioImagen } from '../precios.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

type FilaLote = { id: string; estado: string; items: number; costo_estimado_usd: number | string }
type FilaItem = {
  id: string
  estado: string
  motor: string
  cantidad: number
  foto_id: string | null
  referencia_foto_id: string | null
  costo_estimado_usd: number | string
  grupo: number | null
}

async function restante(supabase: Supabase, topeUsd: number, f: Fetch) {
  const gastadoUsd = redondear(Number(await rpc<number>(supabase, 'gasto_generaciones_mes', { p_org: ORGANIZACION_PILOTO_ID }, f)) || 0)
  return { topeUsd, gastadoUsd, restanteUsd: redondear(Math.max(0, topeUsd - gastadoUsd)) }
}

/** Las fotos del lote tienen que existir y estar vivas. Devuelve la respuesta de error o null. */
async function revisarFotos(supabase: Supabase, ids: readonly string[], uso: 'moto' | 'inspiracion', f: Fetch): Promise<Response | null> {
  if (ids.length === 0) return null
  const fotos = await seleccionar<{ id: string; ruta: string | null; borrada_en: string | null }>(
    supabase,
    'fotos',
    { select: 'id,ruta,borrada_en', id: `in.(${ids.join(',')})`, uso: `eq.${uso}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}` },
    f,
  )
  if (ids.some((id) => !fotos.some((x) => x.id === id))) return error(uso === 'moto' ? 'No se encontró la foto de alguna moto.' : 'No se encontró la foto de inspiración.', 404)
  if (fotos.some((x) => x.borrada_en !== null || x.ruta === null)) {
    return error(uso === 'moto' ? 'Alguna foto se borró: estimá de nuevo con otra.' : 'La foto de inspiración se borró: estimá de nuevo sin ella.', 410)
  }
  return null
}

export async function manejarConfirmacionLote(request: Request, id: string, entorno: Entorno, f: Fetch): Promise<Response> {
  const ctx = await autorizarProductor(request, entorno, 'confirmar generaciones', f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase, topeUsd } = ctx

  if (!UUID.test(id)) return error('No se encontró el lote.', 404)

  try {
    const org = { organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}` }
    const [lote] = await seleccionar<FilaLote>(supabase, 'lotes_generacion', { select: 'id,estado,items,costo_estimado_usd', id: `eq.${id}`, ...org, limit: '1' }, f)
    if (!lote) return error('No se encontró el lote.', 404)
    if (lote.estado !== 'estimado') return error('Ya se confirmó: no se vuelve a cobrar.', 409)

    const items = await seleccionar<FilaItem>(
      supabase,
      'generaciones',
      { select: 'id,estado,motor,cantidad,foto_id,referencia_foto_id,costo_estimado_usd,grupo', lote_id: `eq.${id}`, ...org, order: 'grupo.asc,id.asc' },
      f,
    )
    if (items.length !== lote.items || items.some((i) => i.estado !== 'estimada')) {
      return error('Alguna imagen del lote ya no está para confirmar: estimá de nuevo.', 409)
    }

    // El precio se recalcula en el servidor, imagen por imagen: un motor sin precio no se ejecuta.
    let totalUsd = 0
    for (const i of items) {
      if (!tienePrecioImagen(i.motor) || !Number.isInteger(i.cantidad) || i.cantidad < 1 || i.cantidad > MAX_IMAGENES || i.foto_id === null) {
        console.error('lote: imagen con motor o cantidad inválidos', { id: i.id })
        return error('Este lote no se puede ejecutar: motor o cantidad inválidos.', 500)
      }
      const e = estimarImagenes(i.motor, i.cantidad, { conFoto: true, conReferencia: i.referencia_foto_id !== null })
      if (Math.abs(e.topeTotalUsd - Number(i.costo_estimado_usd)) > 1e-6) return error('El precio cambió desde la estimación: estimá de nuevo.', 409)
      totalUsd += e.topeTotalUsd
    }
    totalUsd = redondear(totalUsd)

    // Las fotos se verifican ANTES de la compuerta: si falta una, no se confirma nada.
    const fotoIds = [...new Set(items.flatMap((i) => (i.foto_id ? [i.foto_id] : [])))]
    const refIds = [...new Set(items.flatMap((i) => (i.referencia_foto_id ? [i.referencia_foto_id] : [])))]
    const mala = (await revisarFotos(supabase, fotoIds, 'moto', f)) ?? (await revisarFotos(supabase, refIds, 'inspiracion', f))
    if (mala) return mala

    // LA COMPUERTA. Si esto no vuelve bien, no queda ninguna imagen confirmada.
    try {
      const confirmado = await rpc<{ loteId: string; generaciones: { id: string; grupo: number | null }[] }>(
        supabase,
        'confirmar_lote_generacion',
        { p_lote: id, p_tope: topeUsd, p_usuario: usuarioId },
        f,
      )
      return responder(
        {
          lote: { id: confirmado.loteId, estado: 'confirmado', costoEstimadoUsd: totalUsd },
          items: confirmado.generaciones.map((g) => ({ generacionId: g.id, grupo: g.grupo })),
        },
        200,
      )
    } catch (err) {
      if (!(err instanceof ErrorSupabase)) throw err
      if (err.status === 402) return responder({ error: 'Supera el tope mensual.', ...(await restante(supabase, topeUsd, f)), estimadoUsd: totalUsd }, 402)
      if (err.status === 409) return error('Ya se confirmó o cambió alguna imagen: no se vuelve a cobrar.', 409)
      if (err.status === 410) return error('La estimación venció: estimá de nuevo.', 410)
      if (err.status === 404) return error('No se encontró el lote.', 404)
      throw err
    }
  } catch (err) {
    console.error('lote: falló la confirmación', err instanceof ErrorSupabase ? err.message : 'error interno')
    return error('No se pudo confirmar el lote. Probá de nuevo en un momento.', 500)
  }
}
