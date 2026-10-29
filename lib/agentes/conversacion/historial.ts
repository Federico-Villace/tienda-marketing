/** Qué se le recuerda al modelo de la conversación: solo los PEDIDOS que salieron bien. */

import { PEDIDOS_HISTORIAL } from './limites.ts'

export type TurnoPrevio = { turno: number; pedido: string; estado: 'pendiente' | 'ok' | 'error' }

/** Los últimos `n` pedidos con respuesta ok, del más viejo al más nuevo. */
export function pedidosAnteriores(turnos: readonly TurnoPrevio[], n = PEDIDOS_HISTORIAL): string[] {
  return turnos
    .filter((t) => t.estado === 'ok')
    .sort((a, b) => a.turno - b.turno)
    .slice(-n)
    .map((t) => t.pedido)
}
