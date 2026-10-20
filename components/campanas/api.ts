import type { PlanVista } from '@/lib/estratega/tipos'

export type ResultadoPatch =
  | { ok: true; plan: PlanVista }
  | { ok: false; status: number; error: string; errores: string[] }

/** PATCH /api/planes/[id]. Nunca lanza: un corte de red vuelve como error con status 0. */
export async function patchPlan(id: string, cuerpo: object): Promise<ResultadoPatch> {
  try {
    const r = await fetch(`/api/planes/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
    const datos = (await r.json().catch(() => ({}))) as { plan?: PlanVista; error?: string; errores?: string[] }
    if (r.ok && datos.plan) return { ok: true, plan: datos.plan }
    return { ok: false, status: r.status, error: datos.error ?? 'No se pudo completar la acción. Probá de nuevo.', errores: datos.errores ?? [] }
  } catch {
    return { ok: false, status: 0, error: 'No se pudo completar la acción. Revisá tu conexión y probá de nuevo.', errores: [] }
  }
}
