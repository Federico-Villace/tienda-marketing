/**
 * Lectura de planes y agrupación por raíz. Lo lee el servidor desde page.tsx;
 * después de actuar el cliente hace router.refresh() (una sola fuente de verdad).
 */

import { seleccionar, type Supabase } from '../supabase/rest.ts'
import type { Brief, EstadoPlan, OrigenPlan, Plan, PlanVista } from './tipos.ts'

export type FilaPlan = {
  id: string
  raiz_id: string
  padre_id: string | null
  version: number
  origen: OrigenPlan
  estado: EstadoPlan
  analisis_id: string
  brief: Brief
  plan: Plan
  modelo: string | null
  costo_usd: number | string
  creado_en: string
  aprobado_en: string | null
}

export const COLUMNAS_PLAN =
  'id,raiz_id,padre_id,version,origen,estado,analisis_id,brief,plan,modelo,costo_usd,creado_en,aprobado_en'

export const vistaDeFila = (x: FilaPlan, desdeCache = false): PlanVista => ({
  id: x.id,
  raizId: x.raiz_id,
  padreId: x.padre_id,
  version: x.version,
  origen: x.origen,
  estado: x.estado,
  brief: x.brief,
  plan: x.plan,
  analisisId: x.analisis_id,
  modelo: x.modelo,
  costoUsd: Number(x.costo_usd),
  creadoEn: x.creado_en,
  aprobadoEn: x.aprobado_en,
  desdeCache,
})

export async function leerPlanes(s: Supabase, organizacionId: string, limite: number, f: typeof fetch): Promise<PlanVista[]> {
  const filas = await seleccionar<FilaPlan>(
    s,
    'planes',
    {
      select: COLUMNAS_PLAN,
      organizacion_id: `eq.${organizacionId}`,
      order: 'creado_en.desc',
      limit: String(limite),
    },
    f,
  )
  return filas.map((x) => vistaDeFila(x))
}

export type GrupoPlan = {
  raizId: string
  /** De la más nueva a la más vieja. */
  versiones: PlanVista[]
  /** La última versión: sobre ella se actúa. */
  punta: PlanVista
  /** El aprobado de la raíz, aunque la punta sea un borrador posterior. */
  vigente: PlanVista | null
}

export function agruparPorRaiz(planes: readonly PlanVista[]): GrupoPlan[] {
  const porRaiz = new Map<string, PlanVista[]>()
  for (const p of planes) porRaiz.set(p.raizId, [...(porRaiz.get(p.raizId) ?? []), p])
  return [...porRaiz.entries()]
    .map(([raizId, vs]) => {
      const versiones = [...vs].sort((a, b) => b.version - a.version)
      return { raizId, versiones, punta: versiones[0]!, vigente: versiones.find((x) => x.estado === 'aprobado') ?? null }
    })
    .sort((a, b) => (a.punta.creadoEn < b.punta.creadoEn ? 1 : a.punta.creadoEn > b.punta.creadoEn ? -1 : 0))
}
