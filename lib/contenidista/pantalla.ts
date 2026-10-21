/** Piezas puras de app/contenido/page.tsx, separadas para poder testearlas. */

import { agruparPorRaiz, type Grupo } from '../agentes/versiones.ts'
import type { EstadoPlan, PlanVista } from '../estratega/tipos.ts'
import type { PiezaVista, TandaVista } from './tipos.ts'

export type GrupoPieza = Grupo<PiezaVista>

/** Los planes aprobados (vigentes) y los que ya tienen contenido, aunque hoy estén reemplazados. */
export function planesConContenido(planes: readonly PlanVista[], tandas: readonly TandaVista[]): PlanVista[] {
  const conTanda = new Set(tandas.map((t) => t.planId))
  return planes.filter((p) => p.estado === 'aprobado' || conTanda.has(p.id))
}

/** ?plan= (si está en la lista) o el aprobado más reciente. Valores inventados caen a lo vigente. */
export function elegirPlanContenido(planes: readonly PlanVista[], planId: string | undefined): PlanVista | null {
  const pedido = planes.find((p) => p.id === planId)
  if (pedido) return pedido
  const aprobados = planes.filter((p) => p.estado === 'aprobado')
  const masNuevo = (a: PlanVista, b: PlanVista) => ((a.aprobadoEn ?? a.creadoEn) < (b.aprobadoEn ?? b.creadoEn) ? 1 : -1)
  return [...(aprobados.length > 0 ? aprobados : planes)].sort(masNuevo)[0] ?? null
}

/** Derivado en lectura, sin trigger: el plan de la tanda ya no es el aprobado. */
export const planDesactualizado = (estadoPlan: EstadoPlan): boolean => estadoPlan !== 'aprobado'

export const tandasDeSemana = (tandas: readonly TandaVista[], semana: number): TandaVista[] =>
  tandas.filter((t) => t.semana === semana).sort((a, b) => (a.creadoEn < b.creadoEn ? 1 : a.creadoEn > b.creadoEn ? -1 : 0))

export function ultimaTandaPorSemana(tandas: readonly TandaVista[]): Map<number, TandaVista> {
  const semanas = new Set(tandas.map((t) => t.semana))
  return new Map([...semanas].map((s) => [s, tandasDeSemana(tandas, s)[0]!]))
}

/** Las piezas de una tanda agrupadas por raíz (una tarjeta por pieza), en el orden en que se escribieron. */
export function gruposDeTanda(piezas: readonly PiezaVista[], tandaId: string): GrupoPieza[] {
  return agruparPorRaiz(
    piezas.filter((p) => p.tandaId === tandaId),
    (p) => p.estado === 'aprobada',
  ).sort((a, b) => a.punta.orden - b.punta.orden)
}
