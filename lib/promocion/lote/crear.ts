/**
 * POST /api/tandas con tipo 'motos' o 'textos' (ADR-032): crea la tanda y TODAS sus hijas
 * de una vez. No cuesta plata ni llama a nadie de afuera. La atomicidad la da la RPC
 * crear_lote_promocion; antes se verifica que cada foto exista y siga viva, para decir
 * 404 / 410 sin crear nada. El precio se guarda tal cual lo validó validarDatos.
 */

import { error, responder } from '../../agentes/http.ts'
import { ORGANIZACION_PILOTO_ID } from '../../organizacion.ts'
import { ErrorSupabase, rpc, seleccionar, type Supabase } from '../../supabase/rest.ts'
import type { FilaPromocion } from '../tipos.ts'
import { vistaDePromocion } from '../vista.ts'
import type { PedidoLote } from './validar.ts'

type Fetch = typeof fetch

/** Los ítems tal como los espera la RPC: una foto, un modelo y sus datos por moto o por texto. */
function itemsDeRpc(p: PedidoLote): Record<string, unknown>[] {
  if (p.tipo === 'motos') return p.motos.map((m) => ({ fotoId: m.fotoId, modelo: m.modelo, datos: m.datos }))
  return p.variantes.map((v) => ({ fotoId: p.fotoId, modelo: p.modelo, datos: v.datos, titular: v.titular, lineaExtra: v.lineaExtra }))
}

export async function crearLote(supabase: Supabase, usuarioId: string, pedido: PedidoLote, f: Fetch): Promise<Response> {
  const fotoIds = [...new Set(pedido.tipo === 'motos' ? pedido.motos.map((m) => m.fotoId) : [pedido.fotoId])]
  try {
    const fotos = await seleccionar<{ id: string; ruta: string | null; borrada_en: string | null }>(
      supabase,
      'fotos',
      { select: 'id,ruta,borrada_en', id: `in.(${fotoIds.join(',')})`, uso: 'eq.moto', organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}` },
      f,
    )
    if (fotoIds.some((id) => !fotos.some((x) => x.id === id))) return error('No se encontró alguna de las fotos.', 404)
    if (fotos.some((x) => x.borrada_en !== null || x.ruta === null)) return error('Alguna foto se borró: subí otra.', 410)

    const creada = await rpc<{ tandaId: string; promociones: FilaPromocion[] }>(
      supabase,
      'crear_lote_promocion',
      {
        p_org: ORGANIZACION_PILOTO_ID,
        p_tipo: pedido.tipo,
        p_marcas: pedido.marcaIds,
        p_items: itemsDeRpc(pedido),
        p_aspecto: pedido.aspecto,
        p_usuario: usuarioId,
      },
      f,
    )
    return responder({ tanda: { id: creada.tandaId, tipo: pedido.tipo }, promociones: creada.promociones.map(vistaDePromocion) }, 201)
  } catch (e) {
    if (e instanceof ErrorSupabase) {
      // PostgREST traduce PT404 → 404, 22023 → 400 y el índice único (23505) → 409.
      if (e.status === 404) return error('No se encontró alguna de las fotos.', 404)
      if (e.status === 400) return error('Revisá la cantidad de motos, textos y marcas del lote.', 400)
      if (e.status === 409) return error('Alguna de esas piezas ya está en el lote.', 409)
    }
    console.error('tandas: falló la creación del lote', e instanceof ErrorSupabase ? e.message : 'error interno')
    return error('No se pudo crear el lote. Probá de nuevo en un momento.', 500)
  }
}
