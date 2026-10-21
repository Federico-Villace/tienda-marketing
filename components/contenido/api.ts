import type { PiezaVista, TandaVista } from '@/lib/contenidista/tipos'

export type ResultadoTanda =
  | { ok: true; tanda: TandaVista; piezas: PiezaVista[]; desdeCache: boolean }
  | { ok: false; status: number; error: string; errores: string[] }

export type ResultadoPieza =
  | { ok: true; pieza: PiezaVista }
  | { ok: false; status: number; error: string; errores: string[] }

const ERROR_RED = 'No se pudo completar la acción. Revisá tu conexión y probá de nuevo.'

/** POST /api/contenido. Nunca lanza: un corte de red vuelve como error con status 0. */
export async function postTanda(cuerpo: { plan_id: string; semana: number; notas: string | null }): Promise<ResultadoTanda> {
  try {
    const r = await fetch('/api/contenido', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
    const d = (await r.json().catch(() => ({}))) as {
      tanda?: TandaVista
      piezas?: PiezaVista[]
      desdeCache?: boolean
      error?: string
      errores?: string[]
    }
    if (r.ok && d.tanda) return { ok: true, tanda: d.tanda, piezas: d.piezas ?? [], desdeCache: Boolean(d.desdeCache) }
    return { ok: false, status: r.status, error: d.error ?? 'No se pudo generar la semana. Probá de nuevo.', errores: d.errores ?? [] }
  } catch {
    return { ok: false, status: 0, error: ERROR_RED, errores: [] }
  }
}

/** PATCH /api/piezas/[id]. Nunca lanza. */
export async function patchPieza(id: string, cuerpo: object): Promise<ResultadoPieza> {
  try {
    const r = await fetch(`/api/piezas/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
    const d = (await r.json().catch(() => ({}))) as { pieza?: PiezaVista; error?: string; errores?: string[] }
    if (r.ok && d.pieza) return { ok: true, pieza: d.pieza }
    return { ok: false, status: r.status, error: d.error ?? 'No se pudo completar la acción. Probá de nuevo.', errores: d.errores ?? [] }
  } catch {
    return { ok: false, status: 0, error: ERROR_RED, errores: [] }
  }
}
