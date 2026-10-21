/**
 * Cliente mínimo de la Interactions API de Gemini, con fetch inyectado y sin SDK.
 *
 * Una request = una imagen. La clave viaja SOLO en el header x-goog-api-key
 * (nunca en la URL ni en el body) y no aparece en ningún error. `store:false`
 * evita que Google retenga el brief 55 días.
 */

import type { Aspecto } from './prompt.ts'
import type { UsoGemini } from './precios.ts'

type Fetch = typeof fetch

const URL_INTERACCIONES = 'https://generativelanguage.googleapis.com/v1beta/interactions'
export const TIMEOUT_IMAGEN_MS = 120_000
const MAX_BYTES = 10 * 1024 * 1024
const MIMES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_MENSAJE = 200

export class ErrorGemini extends Error {
  override name = 'ErrorGemini'
  // Sin parameter properties: el type stripping de Node no las acepta.
  readonly status: number
  constructor(status: number, mensaje: string) {
    super(mensaje)
    this.status = status
  }
}

export type PedidoImagen = {
  readonly apiKey: string
  readonly modelo: string
  readonly prompt: string
  readonly aspecto: Aspecto
  /** null = no se manda generation_config. */
  readonly pensamiento: 'minimal' | null
  readonly timeoutMs?: number
}

export type ResultadoImagen =
  | { readonly bytes: Uint8Array; readonly mimeType: string; readonly usage: UsoGemini | null }
  | { readonly sinImagen: string; readonly usage: UsoGemini | null }

type Bloque = { type?: string; data?: string; mime_type?: string }
type Respuesta = {
  status?: string
  steps?: { type?: string; content?: Bloque[] }[]
  errors?: { message?: string }[]
  usage?: UsoGemini
}

const limpiar = (texto: string, clave: string): string =>
  (clave ? texto.split(clave).join('[clave]') : texto).replace(/\s+/g, ' ').trim().slice(0, MAX_MENSAJE)

function ultimaImagen(r: Respuesta): Bloque | undefined {
  let ultima: Bloque | undefined
  for (const paso of r.steps ?? []) {
    if (paso.type === 'thought') continue
    for (const b of paso.content ?? []) if (b.type === 'image' && typeof b.data === 'string') ultima = b
  }
  return ultima
}

export async function pedirImagen(p: PedidoImagen, f: Fetch): Promise<ResultadoImagen> {
  const cuerpo = {
    model: p.modelo,
    input: p.prompt,
    response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: p.aspecto, image_size: '1K' },
    ...(p.pensamiento ? { generation_config: { thinking_level: p.pensamiento } } : {}),
    store: false,
  }

  let respuesta: Response
  let texto: string
  try {
    respuesta = await f(URL_INTERACCIONES, {
      method: 'POST',
      headers: { 'x-goog-api-key': p.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(p.timeoutMs ?? TIMEOUT_IMAGEN_MS),
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
    throw new ErrorGemini(respuesta.status, `Gemini ${respuesta.status}: ${limpiar(mensaje, p.apiKey)}`)
  }

  let r: Respuesta
  try {
    r = JSON.parse(texto) as Respuesta
  } catch {
    throw new ErrorGemini(502, 'Gemini devolvió una respuesta ilegible.')
  }
  const usage = r.usage ?? null

  const bloque = ultimaImagen(r)
  if (!bloque) {
    // Un bloqueo de seguridad no está documentado: se trata como "sin imagen".
    const detalle = r.errors?.[0]?.message
    return { sinImagen: limpiar(detalle || 'Gemini no devolvió una imagen (posible bloqueo de seguridad).', p.apiKey), usage }
  }
  const mimeType = bloque.mime_type ?? 'image/jpeg'
  if (!MIMES.includes(mimeType)) return { sinImagen: `Formato de imagen no admitido: ${limpiar(mimeType, p.apiKey)}`, usage }
  const bytes = new Uint8Array(Buffer.from(bloque.data!, 'base64'))
  if (bytes.length === 0) return { sinImagen: 'Gemini devolvió una imagen vacía.', usage }
  if (bytes.length > MAX_BYTES) return { sinImagen: 'La imagen supera los 10 MB.', usage }
  return { bytes, mimeType, usage }
}
