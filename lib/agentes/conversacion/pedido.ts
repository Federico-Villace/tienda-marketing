/** Validación común del pedido de un cambio (imagen y texto). */

import { limpiarDescripcion } from '../texto-seguro.ts'
import { MAX_PEDIDO, MENSAJE_PEDIDO, MIN_PEDIDO } from './limites.ts'

export type PedidoLimpio = { ok: true; pedido: string } | { ok: false; error: string }

export function limpiarPedido(x: unknown): PedidoLimpio {
  if (typeof x !== 'string') return { ok: false, error: MENSAJE_PEDIDO }
  const pedido = limpiarDescripcion(x)
  if (pedido.length < MIN_PEDIDO || pedido.length > MAX_PEDIDO) return { ok: false, error: MENSAJE_PEDIDO }
  return { ok: true, pedido }
}

/** El pedido va siempre delimitado en el prompt; limpiarPedido ya sacó las « » del texto. */
export const entreComillas = (pedido: string): string => `«${pedido}»`
