/**
 * Visión con Gemini por la Interactions API: UNA imagen + un texto → un texto (el JSON de la lectura de la referencia).
 *
 * Mismo cliente mínimo que gemini.ts (fetch inyectado, sin SDK): la clave viaja SOLO en el header x-goog-api-key,
 * `store:false` evita que Google retenga la foto, y ningún error lleva la clave ni la foto en base64. No hay
 * `response_format`: el prompt pide SOLO el JSON y el parseo estricto (lib/promocion/referencia/esquema.ts) manda,
 * porque la respuesta es entrada no confiable aunque Gemini hubiera obedecido un esquema.
 */

import { ErrorGemini, limpiar } from './gemini.ts'
import type { UsoGemini } from './precios.ts'

type Fetch = typeof fetch

const URL_INTERACCIONES = 'https://generativelanguage.googleapis.com/v1beta/interactions'
// Carbon pasó los 60 s en producción (ADR-039, adenda 2026-11-16); con Argon y una imagen chica sobra margen.
export const TIMEOUT_VISION_MS = 90_000

export type PedidoVision = {
  readonly apiKey: string
  readonly modelo: string
  readonly prompt: string
  readonly imagen: { readonly bytes: Uint8Array; readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp' }
  /** Tope de tokens de salida (JSON + pensamiento): es lo que presupuesta el estimado. */
  readonly tokensSalidaTope: number
  /** null = no se manda thinking_level. */
  readonly pensamiento: 'low' | null
  readonly timeoutMs?: number
}

export type ResultadoVision = { readonly texto: string; readonly usage: UsoGemini | null }

type Bloque = { type?: string; text?: string }
type Respuesta = { steps?: { type?: string; content?: Bloque[] }[]; usage?: UsoGemini }

/** El texto del ÚLTIMO paso de salida del modelo (los de pensamiento no cuentan). */
function textoDe(r: Respuesta): string {
  let ultimo = ''
  for (const paso of r.steps ?? []) {
    if (paso.type === 'thought') continue
    const t = (paso.content ?? []).flatMap((b) => (b.type === 'text' && typeof b.text === 'string' ? [b.text] : [])).join('')
    if (t !== '') ultimo = t
  }
  return ultimo
}

export async function pedirJsonConImagen(p: PedidoVision, f: Fetch): Promise<ResultadoVision> {
  const base64 = Buffer.from(p.imagen.bytes).toString('base64')
  const cuerpo = {
    model: p.modelo,
    input: [
      { type: 'text', text: p.prompt },
      { type: 'image', mime_type: p.imagen.mimeType, data: base64 },
    ],
    generation_config: { max_output_tokens: p.tokensSalidaTope, ...(p.pensamiento ? { thinking_level: p.pensamiento } : {}) },
    store: false,
  }

  let respuesta: Response
  let texto: string
  try {
    respuesta = await f(URL_INTERACCIONES, {
      method: 'POST',
      headers: { 'x-goog-api-key': p.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(p.timeoutMs ?? TIMEOUT_VISION_MS),
    })
    texto = await respuesta.text()
  } catch (e) {
    const nombre = (e as { name?: string } | null)?.name
    if (nombre === 'TimeoutError' || nombre === 'AbortError') throw new ErrorGemini(504, 'Gemini tardó demasiado.')
    // El mensaje original no se propaga: podría arrastrar detalles de la request.
    throw new ErrorGemini(502, 'No se pudo conectar con Gemini.')
  }

  if (!respuesta.ok) {
    let mensaje = texto
    try {
      mensaje = (JSON.parse(texto) as { error?: { message?: string } }).error?.message ?? texto
    } catch {}
    throw new ErrorGemini(respuesta.status, `Gemini ${respuesta.status}: ${limpiar(mensaje, p.apiKey, base64)}`)
  }

  let r: Respuesta
  try {
    r = JSON.parse(texto) as Respuesta
  } catch {
    throw new ErrorGemini(502, 'Gemini devolvió una respuesta ilegible.')
  }
  return { texto: textoDe(r), usage: r.usage ?? null }
}
