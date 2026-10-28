import type { CreativoVista } from '@/lib/productor/pantalla'
import type { EscenaResumen } from '@/lib/promocion/fondos'

export type EstimacionVista = {
  id: string
  motor: string
  cantidad: number
  aspecto: string
  porImagenUsd: number
  listaUsd: number
  costoEstimadoUsd: number
  venceEn: string
  /** Solo en las ediciones de foto. */
  edicion?: string
  /** Solo en la escena de una tanda: para cuántas promociones es la imagen. */
  promociones?: number
  /** En la escena de una promoción o tanda: el precio incluye la foto de inspiración. */
  conInspiracion?: boolean
  /** En la escena de una promoción o tanda: con qué se pide (fondo, descripción, inspiración, moto). */
  escena?: EscenaResumen
}

export type ResultadoEstimacion =
  | { ok: true; generacion: EstimacionVista; mes: { gastadoUsd: number; topeUsd: number }; excedeTope: boolean }
  | { ok: false; status: number; error: string }

export type ResultadoConfirmacion =
  | {
      ok: true
      generacion: { id: string; estado: string; costoRealUsd: number; costoEstimadoUsd: number; error: string | null }
      creativos: CreativoVista[]
    }
  | { ok: false; status: number; error: string; restanteUsd?: number; topeUsd?: number }

export type ResultadoElegir = { ok: true; creativo: { id: string; elegida: boolean } } | { ok: false; status: number; error: string }

export type FotoSubida = { id: string; ancho: number; alto: number; url: string | null }
export type ResultadoSubida = { ok: true; foto: FotoSubida } | { ok: false; status: number; error: string }
export type ResultadoBorrado = { ok: true; pendiente: boolean } | { ok: false; status: number; error: string }

const ERROR_RED = 'No se pudo completar la acción. Revisá tu conexión y probá de nuevo.'
const JSON_HEADERS = { 'content-type': 'application/json' }

/** POST /api/generaciones. El cliente NO manda precio: solo qué pieza, qué motor y cuántas. Nunca lanza. */
export function postEstimacion(cuerpo: { piezaId: string; motor: string; cantidad: number }): Promise<ResultadoEstimacion> {
  return pedirEstimacion({ piezaId: cuerpo.piezaId, motor: cuerpo.motor, cantidad: cuerpo.cantidad })
}

async function pedirEstimacion(cuerpo: Record<string, string | number>): Promise<ResultadoEstimacion> {
  try {
    const r = await fetch('/api/generaciones', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(cuerpo) })
    const d = (await r.json().catch(() => ({}))) as {
      generacion?: EstimacionVista
      mes?: { gastadoUsd: number; topeUsd: number }
      excedeTope?: boolean
      error?: string
    }
    if (r.ok && d.generacion && d.mes) return { ok: true, generacion: d.generacion, mes: d.mes, excedeTope: Boolean(d.excedeTope) }
    return { ok: false, status: r.status, error: d.error ?? 'No se pudo estimar. Probá de nuevo.' }
  } catch {
    return { ok: false, status: 0, error: ERROR_RED }
  }
}

/** POST /api/generaciones/[id]/confirmar: el click que gasta. Nunca lanza. */
export async function postConfirmar(id: string): Promise<ResultadoConfirmacion> {
  try {
    const r = await fetch(`/api/generaciones/${id}/confirmar`, { method: 'POST' })
    const d = (await r.json().catch(() => ({}))) as {
      generacion?: { id: string; estado: string; costoRealUsd: number; costoEstimadoUsd: number; error: string | null }
      creativos?: CreativoVista[]
      error?: string
      restanteUsd?: number
      topeUsd?: number
    }
    if (r.ok && d.generacion) return { ok: true, generacion: d.generacion, creativos: d.creativos ?? [] }
    return {
      ok: false,
      status: r.status,
      error: d.error ?? 'No se pudo generar. Probá de nuevo.',
      ...(d.restanteUsd !== undefined ? { restanteUsd: d.restanteUsd } : {}),
      ...(d.topeUsd !== undefined ? { topeUsd: d.topeUsd } : {}),
    }
  } catch {
    return { ok: false, status: 0, error: ERROR_RED }
  }
}

/** PATCH /api/creativos/[id]. Nunca lanza. */
export async function patchCreativo(id: string, elegida: boolean): Promise<ResultadoElegir> {
  try {
    const r = await fetch(`/api/creativos/${id}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ elegida }) })
    const d = (await r.json().catch(() => ({}))) as { creativo?: { id: string; elegida: boolean }; error?: string }
    if (r.ok && d.creativo) return { ok: true, creativo: d.creativo }
    return { ok: false, status: r.status, error: d.error ?? 'No se pudo guardar la elección. Probá de nuevo.' }
  } catch {
    return { ok: false, status: 0, error: ERROR_RED }
  }
}

/** POST /api/fotos (multipart). El content-type lo arma el navegador con su boundary. Nunca lanza. */
export async function postFoto(formulario: FormData): Promise<ResultadoSubida> {
  try {
    const r = await fetch('/api/fotos', { method: 'POST', body: formulario })
    const d = (await r.json().catch(() => ({}))) as { foto?: FotoSubida; error?: string }
    if (r.ok && d.foto) return { ok: true, foto: d.foto }
    // Vercel corta con un 413 que no es JSON: se traduce.
    const porDefecto = r.status === 413 ? 'La foto pesa demasiado.' : 'No se pudo subir la foto. Probá de nuevo.'
    return { ok: false, status: r.status, error: d.error ?? porDefecto }
  } catch {
    return { ok: false, status: 0, error: ERROR_RED }
  }
}

/** DELETE /api/fotos/[id]. Nunca lanza. */
export async function deleteFoto(id: string): Promise<ResultadoBorrado> {
  try {
    const r = await fetch(`/api/fotos/${id}`, { method: 'DELETE' })
    const d = (await r.json().catch(() => ({}))) as { pendiente?: boolean; error?: string }
    if (r.ok) return { ok: true, pendiente: Boolean(d.pendiente) }
    return { ok: false, status: r.status, error: d.error ?? 'No se pudo borrar la foto. Probá de nuevo.' }
  } catch {
    return { ok: false, status: 0, error: ERROR_RED }
  }
}

/** POST /api/generaciones desde una foto. El cliente NO manda precio. Nunca lanza. */
export async function postEstimacionFoto(cuerpo: {
  fotoId: string
  edicion: string
  aspecto: string
  motor: string
  cantidad: number
}): Promise<ResultadoEstimacion> {
  return pedirEstimacion({
    fotoId: cuerpo.fotoId,
    edicion: cuerpo.edicion,
    aspecto: cuerpo.aspecto,
    motor: cuerpo.motor,
    cantidad: cuerpo.cantidad,
  })
}

/** POST /api/generaciones para la escena de una promoción. El formato, la foto y el fondo salen de la promoción; el cliente NO manda precio. Nunca lanza. */
export function postEstimacionPromocion(cuerpo: { promocionId: string; motor: string; cantidad: number }): Promise<ResultadoEstimacion> {
  return pedirEstimacion({ promocionId: cuerpo.promocionId, motor: cuerpo.motor, cantidad: cuerpo.cantidad })
}

/** POST /api/generaciones para la escena COMPARTIDA de una tanda: una sola imagen, un solo cobro. El cliente NO manda precio. Nunca lanza. */
export function postEstimacionTanda(cuerpo: { tandaId: string; motor: string; cantidad: number }): Promise<ResultadoEstimacion> {
  return pedirEstimacion({ tandaId: cuerpo.tandaId, motor: cuerpo.motor, cantidad: cuerpo.cantidad })
}

/** El lote de escenas de una tanda de motos: una imagen por moto (ADR-032). */
export type LoteVista = {
  id: string
  costoEstimadoUsd: number
  items: { generacionId: string; grupo: number | null; modelo: string; costoEstimadoUsd: number }[]
  venceEn: string
}
export type ResultadoEstimacionLote =
  | { ok: true; lote: LoteVista; mes: { gastadoUsd: number; topeUsd: number }; excedeTope: boolean }
  | { ok: false; status: number; error: string }
export type ResultadoConfirmacionLote =
  | { ok: true; items: { generacionId: string; grupo: number | null }[] }
  | { ok: false; status: number; error: string; restanteUsd?: number; topeUsd?: number }
export type ResultadoLiberacion = { ok: true; liberadas: number } | { ok: false; status: number; error: string }

/** POST /api/generaciones/lote: el precio de las N imágenes. El cliente NO manda precio. Nunca lanza. */
export async function postEstimacionLote(cuerpo: { tandaId: string; variantes: number; motor: string; grupos?: number[] }): Promise<ResultadoEstimacionLote> {
  try {
    const r = await fetch('/api/generaciones/lote', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ tandaId: cuerpo.tandaId, variantes: cuerpo.variantes, motor: cuerpo.motor, ...(cuerpo.grupos ? { grupos: cuerpo.grupos } : {}) }),
    })
    const d = (await r.json().catch(() => ({}))) as { lote?: LoteVista; mes?: { gastadoUsd: number; topeUsd: number }; excedeTope?: boolean; error?: string }
    if (r.ok && d.lote && d.mes) return { ok: true, lote: d.lote, mes: d.mes, excedeTope: Boolean(d.excedeTope) }
    return { ok: false, status: r.status, error: d.error ?? 'No se pudo estimar. Probá de nuevo.' }
  } catch {
    return { ok: false, status: 0, error: ERROR_RED }
  }
}

/** POST /api/generaciones/lote/[id]/confirmar: el click que confirma TODAS o ninguna. No genera: eso es postEjecutar. Nunca lanza. */
export async function postConfirmarLote(id: string): Promise<ResultadoConfirmacionLote> {
  try {
    const r = await fetch(`/api/generaciones/lote/${id}/confirmar`, { method: 'POST' })
    const d = (await r.json().catch(() => ({}))) as { items?: { generacionId: string; grupo: number | null }[]; error?: string; restanteUsd?: number; topeUsd?: number }
    if (r.ok && d.items) return { ok: true, items: d.items }
    return {
      ok: false,
      status: r.status,
      error: d.error ?? 'No se pudo confirmar. Probá de nuevo.',
      ...(d.restanteUsd !== undefined ? { restanteUsd: d.restanteUsd } : {}),
      ...(d.topeUsd !== undefined ? { topeUsd: d.topeUsd } : {}),
    }
  } catch {
    return { ok: false, status: 0, error: ERROR_RED }
  }
}

/** POST /api/generaciones/[id]/ejecutar: genera UNA imagen ya confirmada del lote. Nunca lanza. */
export async function postEjecutar(id: string): Promise<ResultadoConfirmacion> {
  try {
    const r = await fetch(`/api/generaciones/${id}/ejecutar`, { method: 'POST' })
    const d = (await r.json().catch(() => ({}))) as {
      generacion?: { id: string; estado: string; costoRealUsd: number; costoEstimadoUsd: number; error: string | null }
      creativos?: CreativoVista[]
      error?: string
    }
    if (r.ok && d.generacion) return { ok: true, generacion: d.generacion, creativos: d.creativos ?? [] }
    return { ok: false, status: r.status, error: d.error ?? 'No se pudo generar. Probá de nuevo.' }
  } catch {
    return { ok: false, status: 0, error: ERROR_RED }
  }
}

/** POST /api/generaciones/lote/[id]/liberar: lo confirmado que no se generó deja de contar en el tope. Nunca lanza. */
export async function postLiberarLote(id: string): Promise<ResultadoLiberacion> {
  try {
    const r = await fetch(`/api/generaciones/lote/${id}/liberar`, { method: 'POST' })
    const d = (await r.json().catch(() => ({}))) as { liberadas?: number; error?: string }
    if (r.ok) return { ok: true, liberadas: Number(d.liberadas) || 0 }
    return { ok: false, status: r.status, error: d.error ?? 'No se pudo liberar. Probá de nuevo.' }
  } catch {
    return { ok: false, status: 0, error: ERROR_RED }
  }
}
