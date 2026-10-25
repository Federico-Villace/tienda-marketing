import type { AnalisisVista } from '@/lib/analista/historial'
import type { PedidoPromocion } from '@/lib/promocion/datos'
import type { CopyPromo, PromocionVista } from '@/lib/promocion/tipos'

/** Los datos del pedido tal como viajan por la red (sin los tipos internos del servidor). */
export type PedidoCreacion = {
  marcaId: string
  modelo: string
  precio: { moneda: 'ARS' | 'USD'; monto: number }
  promo: { tipo: PedidoPromocion['datos']['promo']['tipo']; detalle: string }
  lugar: string
  indicaciones: string
  fotoId: string
  aspecto: PedidoPromocion['aspecto']
}

export type Fallo = { ok: false; status: number; error: string; errores?: string[] }
export type ConPromocion = { ok: true; promocion: PromocionVista; avisos: string[] }

const ERROR_RED = 'No se pudo completar la acción. Revisá tu conexión y probá de nuevo.'
const JSON_HEADERS = { 'content-type': 'application/json' }

/** Hace el pedido y lo deja en { ok, cuerpo } o en un fallo con el mensaje del servidor. Nunca lanza. */
async function pedir<T extends object>(url: string, metodo: 'POST' | 'PATCH', cuerpo: unknown, porDefecto: string): Promise<({ ok: true } & T) | Fallo> {
  try {
    const r = await fetch(url, { method: metodo, headers: JSON_HEADERS, ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }) })
    const d = (await r.json().catch(() => ({}))) as Record<string, unknown>
    if (r.ok) return { ok: true, ...(d as T) }
    return { ok: false, status: r.status, error: typeof d.error === 'string' ? d.error : porDefecto, ...(Array.isArray(d.errores) ? { errores: d.errores as string[] } : {}) }
  } catch {
    return { ok: false, status: 0, error: ERROR_RED }
  }
}

const conAvisos = <T extends { avisos?: string[] }>(r: ({ ok: true } & T) | Fallo) => (r.ok ? { ...r, avisos: r.avisos ?? [] } : r)

export async function postPromocion(pedido: PedidoCreacion): Promise<ConPromocion | Fallo> {
  return conAvisos(await pedir<{ promocion: PromocionVista; avisos?: string[] }>('/api/promociones', 'POST', pedido, 'No se pudo crear la promoción. Probá de nuevo.')) as ConPromocion | Fallo
}

/** Cambia campos o ejecuta una acción (aprobar, reabrir, descartar). Siempre con la revisión que se veía. */
export async function patchPromocion(id: string, cuerpo: Record<string, unknown> & { revision: number }): Promise<ConPromocion | Fallo> {
  return conAvisos(await pedir<{ promocion: PromocionVista; avisos?: string[]; aprobacion?: { version: number }; url?: string | null }>(`/api/promociones/${id}`, 'PATCH', cuerpo, 'No se pudo guardar. Probá de nuevo.')) as ConPromocion | Fallo
}

export function postAntecedentes(id: string) {
  return pedir<{ analisis: AnalisisVista; desdeCache: boolean; promocion: PromocionVista }>(`/api/promociones/${id}/antecedentes`, 'POST', undefined, 'No se pudo revisar cómo les fue. Probá de nuevo.')
}

export type TextosVista = { id: string; opciones: CopyPromo[]; intento: number; costoUsd: number; desdeCache: boolean; desactualizado: boolean }

export function postTextos(id: string, cuerpo: { revision: number; otras?: boolean }) {
  return pedir<{ textos: TextosVista; promocion: PromocionVista }>(`/api/promociones/${id}/textos`, 'POST', cuerpo, 'No se pudieron escribir los textos. Probá de nuevo.')
}

export function postPlaca(id: string, cuerpo: { revision: number }) {
  return pedir<{ url: string | null; hash: string; reutilizada: boolean; promocion: PromocionVista }>(`/api/promociones/${id}/placa`, 'POST', cuerpo, 'No se pudo armar la imagen final. Probá de nuevo.')
}

export function patchAnalisis(id: string, cuerpo: { version: number; contenido: string }) {
  return pedir<{ analisis: AnalisisVista }>(`/api/analisis/${id}`, 'PATCH', cuerpo, 'No se pudo guardar la edición. Probá de nuevo.')
}
