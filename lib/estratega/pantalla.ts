/** Piezas puras de app/campanas/page.tsx, separadas para poder testearlas. */

import type { AnalisisVista } from '../analista/historial.ts'
import { MARCAS } from '../datos/marcas.ts'
import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { seleccionar, type Supabase } from '../supabase/rest.ts'
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

export const rotuloAnalisis = (a: AnalisisVista): string => {
  const marca = MARCAS.find((m) => m.id === a.filtros.marcaId)?.nombre ?? '—'
  return `${fechaCorta.format(new Date(a.creadoEn)).replace(/[-.]/g, ' ').replace(/\s+/g, ' ').trim()} · ${marca} · ${a.filtros.desde} a ${a.filtros.hasta}`
}

/** Hoy (hora Argentina) y cuatro semanas: lo más usual para un plan. */
export function ventanaPorDefecto(ahora: Date): { desde: string; hasta: string } {
  const hoy = ahora.getTime() - AR_MS
  const dia = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  return { desde: dia(hoy), hasta: dia(hoy + (SEMANAS_POR_DEFECTO * 7 - 1) * DIA_MS) }
}

export const puedeEditarPlanes = (rol: string | null): boolean => rol === 'director' || rol === 'operador'

/** El rol del usuario que verificó el proxy. Sin usuario o sin membresía: null. */
export async function leerRol(s: Supabase, usuarioId: string | null, f: typeof fetch): Promise<string | null> {
  if (!usuarioId) return null
  const [m] = await seleccionar<{ rol: string }>(
    s,
    'miembros',
    { select: 'rol', organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, usuario_id: `eq.${usuarioId}` },
    f,
  )
  return m?.rol ?? null
}
