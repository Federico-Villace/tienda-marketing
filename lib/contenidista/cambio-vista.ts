/** Qué versiones de una pieza se crearon pidiéndole un cambio a la IA: versión -> el pedido (ADR-034). */

import type { TurnoVista } from '../agentes/conversacion/tipos.ts'

export function cambiosDePieza(turnos: readonly TurnoVista[]): Record<number, string> {
  const salida: Record<number, string> = {}
  for (const t of turnos) {
    const version = t.respuesta?.version
    if (t.estado === 'ok' && typeof version === 'number') salida[version] = t.pedido
  }
  return salida
}
