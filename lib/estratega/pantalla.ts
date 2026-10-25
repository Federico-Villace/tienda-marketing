/** Piezas puras de app/campanas/page.tsx, separadas para poder testearlas. */

import type { AnalisisVista } from '../analista/historial.ts'
import { leerRol, puedeEditar } from '../agentes/pantalla.ts'
import { paramsMarcas } from '../datos/filtros.ts'
import { ordenarMarcas, rotuloMarcas } from '../datos/marcas.ts'
import type { GrupoPlan } from './historial.ts'
import type { PlanVista } from './tipos.ts'

const fechaCorta = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', timeZone: 'America/Argentina/Buenos_Aires' })
const AR_MS = 3 * 60 * 60 * 1000
const DIA_MS = 24 * 60 * 60 * 1000
const SEMANAS_POR_DEFECTO = 4

export type Seleccion = { grupo: GrupoPlan; vista: PlanVista; esPunta: boolean }

/** Raíz de ?plan= (o la más reciente) y su versión de ?v= (o la última). Valores inventados caen a lo vigente. */
export function elegirPlan(grupos: readonly GrupoPlan[], q: { plan?: string; v?: string }): Seleccion | null {
  const grupo = grupos.find((g) => g.raizId === q.plan) ?? grupos[0]
  if (!grupo) return null
  const n = Number(q.v)
  const vista = grupo.versiones.find((x) => x.version === n) ?? grupo.punta
  return { grupo, vista, esPunta: vista.id === grupo.punta.id }
}

/** Los ids de marca de un análisis, para preseleccionarlas en el brief del plan. */
export const marcaIdsDeAnalisis = (a: Pick<AnalisisVista, 'filtros'>): string[] => ordenarMarcas(a.filtros.marcaIds)

/** Link a /campanas con el análisis y sus marcas ya elegidos ("Armar un plan con este análisis"). */
export function hrefPlanDesdeAnalisis(analisisId: string, marcaIds: readonly string[]): string {
  const q = new URLSearchParams({ analisis: analisisId })
  for (const [k, v] of paramsMarcas(marcaIds)) q.append(k, v)
  return `/campanas?${q.toString()}`
}

export const rotuloAnalisis = (a: AnalisisVista): string => {
  const marca = rotuloMarcas(a.filtros.marcaIds)
  return `${fechaCorta.format(new Date(a.creadoEn)).replace(/[-.]/g, ' ').replace(/\s+/g, ' ').trim()} · ${marca} · ${a.filtros.desde} a ${a.filtros.hasta}`
}

/** Hoy (hora Argentina) y cuatro semanas: lo más usual para un plan. */
export function ventanaPorDefecto(ahora: Date): { desde: string; hasta: string } {
  const hoy = ahora.getTime() - AR_MS
  const dia = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  return { desde: dia(hoy), hasta: dia(hoy + (SEMANAS_POR_DEFECTO * 7 - 1) * DIA_MS) }
}

export { leerRol }
export const puedeEditarPlanes = puedeEditar
