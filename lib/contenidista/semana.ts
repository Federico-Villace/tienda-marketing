/** Cuentas de una semana de un plan: rango de fechas y cantidad de piezas pedidas. */

import type { Plan } from '../estratega/tipos.ts'
import { fechaIso } from '../estratega/brief.ts'
import { LIMITES } from './limites.ts'

const DIA_MS = 24 * 60 * 60 * 1000
const dia = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Semana N = ventana.desde + (N-1)·7 días, hasta 6 días después o el fin de la ventana. null si no existe. */
export function rangoSemana(plan: Plan, semana: number): { desde: string; hasta: string } | null {
  if (!plan.calendario.some((s) => s.semana === semana)) return null
  const inicio = fechaIso(plan.ventana.desde)
  const fin = fechaIso(plan.ventana.hasta)
  if (inicio === null || fin === null) return null
  const desde = inicio + (semana - 1) * 7 * DIA_MS
  if (desde > fin) return null
  return { desde: dia(desde), hasta: dia(Math.min(desde + 6 * DIA_MS, fin)) }
}

export const piezasPedidas = (plan: Plan, semana: number): number =>
  plan.calendario.find((s) => s.semana === semana)?.piezas.reduce((a, p) => a + p.cantidad, 0) ?? 0

export const excedeTope = (plan: Plan, semana: number): boolean => piezasPedidas(plan, semana) > LIMITES.PIEZAS_POR_SEMANA
