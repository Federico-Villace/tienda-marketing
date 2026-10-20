/**
 * Cliente mínimo de la Responses API de OpenAI, por fetch inyectado (sin SDK),
 * como el resto de lib/.
 *
 * Regla dura: la clave solo viaja en el header Authorization. Ningún mensaje de
 * error la incluye NI repite el texto que devuelve OpenAI (el de un 401 trae un
 * pedazo de la clave): los mensajes son nuestros, en español.
 */

import type { Uso } from './precios.ts'

type Fetch = typeof fetch

const URL_RESPONSES = 'https://api.openai.com/v1/responses'
const TIMEOUT_MS = 90_000
const MAX_TOKENS_SALIDA = 6000

/**
 * Caché explícito sin breakpoints: evita el recargo de 1,25× por escritura.
 * Si OpenAI lo rechazara (400) para el modelo, se saca borrando ESTA constante
 * y la línea que la usa en `cuerpo`.
 */
const PROMPT_CACHE_OPTIONS = { mode: 'explicit' } as const

export type TipoErrorOpenAI = 'http' | 'timeout' | 'red' | 'incompleto' | 'vacio' | 'rechazo'

/** Structured outputs de la Responses API: va en `text.format`. */
export type FormatoTexto =
  | { readonly type: 'json_object' }
  | {
      readonly type: 'json_schema'
      readonly name: string
      readonly strict: boolean
      readonly schema: Readonly<Record<string, unknown>>
    }

export class ErrorOpenAI extends Error {
  override name = 'ErrorOpenAI'
  // Sin parameter properties: el type stripping de Node (scripts/) no las acepta.
  readonly tipo: TipoErrorOpenAI
  readonly status: number | null
  constructor(mensaje: string, tipo: TipoErrorOpenAI, status: number | null = null) {
    super(mensaje)
    this.tipo = tipo
    this.status = status
  }
}

type ItemSalida = { type?: string; content?: { type?: string; text?: string }[] }
type RespuestaOpenAI = {
  status?: string
  incomplete_details?: { reason?: string } | null
  output?: ItemSalida[]
  usage?: {
    input_tokens?: number
    input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number }
    output_tokens?: number
    output_tokens_details?: { reasoning_tokens?: number }
  }
}

const mensajeHttp = (status: number): string => {
  if (status === 401 || status === 403) return 'OpenAI rechazó la clave de API. Revisá OPENAI_API_KEY.'
  if (status === 429) return 'OpenAI recibió demasiados pedidos o se agotó el límite. Probá de nuevo en un rato.'
  return `OpenAI respondió con un error (${status}). Probá de nuevo en un rato.`
}

export async function pedirRespuesta(
  p: { apiKey: string; modelo: string; instrucciones: string; entrada: string; formato?: FormatoTexto },
  f: Fetch,
): Promise<{ texto: string; uso: Uso }> {
  const cuerpo = {
    model: p.modelo,
    instructions: p.instrucciones,
    input: p.entrada,
    reasoning: { effort: 'low' },
    max_output_tokens: MAX_TOKENS_SALIDA,
    store: false,
    prompt_cache_options: PROMPT_CACHE_OPTIONS,
    // Sin `formato` el body queda idéntico al del Analista.
    ...(p.formato ? { text: { format: p.formato } } : {}),
  }

  // AbortController + setTimeout (y no AbortSignal.timeout) para poder testear con timers falsos.
  const control = new AbortController()
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS)

  let respuesta: Response
  try {
    respuesta = await f(URL_RESPONSES, {
      method: 'POST',
      headers: { authorization: `Bearer ${p.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: control.signal,
    })
  } catch {
    // Se descarta el error original a propósito: no hay que arriesgarse a copiar headers.
    if (control.signal.aborted) {
      throw new ErrorOpenAI('OpenAI tardó más de 90 segundos en responder. Probá de nuevo.', 'timeout')
    }
    throw new ErrorOpenAI('No se pudo conectar con OpenAI. Probá de nuevo en un momento.', 'red')
  } finally {
    clearTimeout(timer)
  }

  if (!respuesta.ok) throw new ErrorOpenAI(mensajeHttp(respuesta.status), 'http', respuesta.status)

  const r = (await respuesta.json()) as RespuestaOpenAI

  if (r.status === 'incomplete') {
    throw new ErrorOpenAI('OpenAI devolvió una respuesta incompleta. Probá de nuevo.', 'incompleto')
  }

  const contenidos = (r.output ?? []).filter((i) => i.type === 'message').flatMap((i) => i.content ?? [])
  // El rechazo del modelo trae su propio texto: no se repite.
  if (contenidos.some((c) => c.type === 'refusal')) {
    throw new ErrorOpenAI('El modelo se negó a responder este pedido.', 'rechazo')
  }

  const texto = contenidos
    .filter((c) => c.type === 'output_text')
    .map((c) => c.text ?? '')
    .join('')
  if (texto.trim().length === 0) throw new ErrorOpenAI('OpenAI no devolvió ningún texto.', 'vacio')

  const u = r.usage ?? {}
  return {
    texto,
    uso: {
      entrada: u.input_tokens ?? 0,
      cacheadas: u.input_tokens_details?.cached_tokens ?? 0,
      escrituraCache: u.input_tokens_details?.cache_write_tokens ?? 0,
      salida: u.output_tokens ?? 0,
      razonamiento: u.output_tokens_details?.reasoning_tokens ?? 0,
    },
  }
}
