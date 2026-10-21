/**
 * Lectura de tandas y piezas. La lee el servidor desde page.tsx; después de
 * actuar el cliente hace router.refresh() (una sola fuente de verdad).
 */

import { seleccionar, type Supabase } from '../supabase/rest.ts'
import type { EstadoPieza, OrigenPieza, Pieza, PiezaVista, TandaVista } from './tipos.ts'

export type FilaPieza = {
  id: string
  raiz_id: string
  padre_id: string | null
  tanda_id: string
  plan_id: string
  semana: number
  orden: number
  version: number
  origen: OrigenPieza
  estado: EstadoPieza
  pieza: Pieza
  creado_en: string
  aprobado_en: string | null
}

export type FilaTanda = {
  id: string
  plan_id: string
  semana: number
  notas: string | null
  modelo: string
  costo_usd: number | string
  creado_en: string
}

export const COLUMNAS_PIEZA =
  'id,raiz_id,padre_id,tanda_id,plan_id,semana,orden,version,origen,estado,pieza,creado_en,aprobado_en'
export const COLUMNAS_TANDA = 'id,plan_id,semana,notas,modelo,costo_usd,creado_en'

export const vistaDePieza = (x: FilaPieza): PiezaVista => ({
  id: x.id,
  raizId: x.raiz_id,
  padreId: x.padre_id,
  version: x.version,
  origen: x.origen,
  estado: x.estado,
  tandaId: x.tanda_id,
  planId: x.plan_id,
  semana: x.semana,
  orden: x.orden,
  pieza: x.pieza,
  creadoEn: x.creado_en,
  aprobadoEn: x.aprobado_en,
})

export const vistaDeTanda = (x: FilaTanda, desdeCache = false): TandaVista => ({
  id: x.id,
  planId: x.plan_id,
  semana: x.semana,
  notas: x.notas,
  modelo: x.modelo,
  costoUsd: Number(x.costo_usd),
  creadoEn: x.creado_en,
  desdeCache,
})

export async function leerTandas(s: Supabase, planIds: readonly string[], f: typeof fetch): Promise<TandaVista[]> {
  if (planIds.length === 0) return []
  const filas = await seleccionar<FilaTanda>(
    s,
    'tandas_contenido',
    { select: COLUMNAS_TANDA, plan_id: `in.(${planIds.join(',')})`, order: 'creado_en.desc' },
    f,
  )
  return filas.map((x) => vistaDeTanda(x))
}

export async function leerPiezas(s: Supabase, tandaIds: readonly string[], f: typeof fetch): Promise<PiezaVista[]> {
  if (tandaIds.length === 0) return []
  const filas = await seleccionar<FilaPieza>(
    s,
    'piezas',
    { select: COLUMNAS_PIEZA, tanda_id: `in.(${tandaIds.join(',')})`, order: 'orden.asc,version.asc' },
    f,
  )
  return filas.map(vistaDePieza)
}
