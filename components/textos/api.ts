const ERROR_RED = 'No se pudo completar la acción. Revisá tu conexión y probá de nuevo.'

export type ResultadoCambio = { ok: true } | { ok: false; status: number; error: string }

async function pedir(url: string, cuerpo: Record<string, unknown>): Promise<ResultadoCambio> {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })
    const d = (await r.json().catch(() => ({}))) as { error?: string }
    if (r.ok) return { ok: true }
    return { ok: false, status: r.status, error: d.error ?? 'No se pudo pedir el cambio. Probá de nuevo.' }
  } catch {
    return { ok: false, status: 0, error: ERROR_RED }
  }
}

/** POST /api/promociones/[id]/textos/cambio. Cuesta centavos y el servidor pone el tope. Nunca lanza. */
export const postCambioTexto = (promocionId: string, cuerpo: { instruccion: string; revision: number }) =>
  pedir(`/api/promociones/${promocionId}/textos/cambio`, cuerpo)

/** POST /api/piezas/[id]/cambio: crea una versión nueva en borrador. Nunca lanza. */
export const postCambioPieza = (piezaId: string, cuerpo: { instruccion: string; version: number }) => pedir(`/api/piezas/${piezaId}/cambio`, cuerpo)
