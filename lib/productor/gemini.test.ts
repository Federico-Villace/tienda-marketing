import { describe, it, expect, vi } from 'vitest'
import { ErrorGemini, pedirImagen, type PedidoImagen } from './gemini'

const CLAVE = 'AIza-clave-secreta-123'
const b64 = (bytes: number[]) => Buffer.from(bytes).toString('base64')

const pedido = (o: Partial<PedidoImagen> = {}): PedidoImagen => ({
  apiKey: CLAVE,
  modelo: 'gemini-nano-banana-2.1',
  prompt: 'una moto roja',
  aspecto: '4:5',
  pensamiento: 'minimal',
  ...o,
})

const ok = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status })
const conImagen = (bytes = [0xff, 0xd8, 0xff, 0xd9], extra: object = {}) => ({
  status: 'completed',
  steps: [{ type: 'model_output', content: [{ type: 'image', data: b64(bytes), mime_type: 'image/jpeg' }] }],
  usage: { total_input_tokens: 10, total_output_tokens: 1120 },
  ...extra,
})

describe('pedirImagen: request (S2.4, R7)', () => {
  it('hace POST a interactions con la clave en el header y nunca en la URL ni el body', async () => {
    const f = vi.fn(async () => ok(conImagen()))
    await pedirImagen(pedido(), f as unknown as typeof fetch)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/interactions')
    expect(String(url)).not.toContain(CLAVE)
    expect(init.method).toBe('POST')
    const h = init.headers as Record<string, string>
    expect(h['x-goog-api-key']).toBe(CLAVE)
    expect(h['content-type']).toBe('application/json')
    expect(String(init.body)).not.toContain(CLAVE)
  })

  it('el body lleva image_size "1K", el aspect_ratio, store:false y thinking minimal', async () => {
    const f = vi.fn(async () => ok(conImagen()))
    await pedirImagen(pedido(), f as unknown as typeof fetch)
    const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(body).toEqual({
      model: 'gemini-nano-banana-2.1',
      input: 'una moto roja',
      response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '4:5', image_size: '1K' },
      generation_config: { thinking_level: 'minimal' },
      store: false,
    })
  })

  it('sin pensamiento (pro) no manda generation_config', async () => {
    const f = vi.fn(async () => ok(conImagen()))
    await pedirImagen(pedido({ modelo: 'gemini-3-pro-image', pensamiento: null }), f as unknown as typeof fetch)
    const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(body.generation_config).toBeUndefined()
    expect(body.store).toBe(false)
  })
})

describe('pedirImagen: respuesta', () => {
  it('devuelve los bytes, el mime y el usage', async () => {
    const f = async () => ok(conImagen([0xff, 0xd8, 0x01, 0xff, 0xd9]))
    const r = await pedirImagen(pedido(), f as unknown as typeof fetch)
    if (!('bytes' in r)) throw new Error('esperaba imagen')
    expect(Array.from(r.bytes)).toEqual([0xff, 0xd8, 0x01, 0xff, 0xd9])
    expect(r.mimeType).toBe('image/jpeg')
    expect(r.usage?.total_input_tokens).toBe(10)
  })

  it('toma el último bloque de imagen y ignora los steps de pensamiento', async () => {
    const cuerpo = {
      status: 'completed',
      steps: [
        { type: 'thought', content: [{ type: 'image', data: b64([1]), mime_type: 'image/jpeg' }] },
        { type: 'model_output', content: [{ type: 'image', data: b64([0xff, 0xd8, 2]), mime_type: 'image/jpeg' }, { type: 'image', data: b64([0xff, 0xd8, 3]), mime_type: 'image/jpeg' }] },
      ],
    }
    const r = await pedirImagen(pedido(), (async () => ok(cuerpo)) as unknown as typeof fetch)
    if (!('bytes' in r)) throw new Error('esperaba imagen')
    expect(Array.from(r.bytes)).toEqual([0xff, 0xd8, 3])
  })

  it('S8.2 sin bloque de imagen devuelve sinImagen con el mensaje recortado y el usage', async () => {
    const largo = 'x'.repeat(500)
    const cuerpo = { status: 'failed', steps: [], errors: [{ message: largo }], usage: { total_input_tokens: 7 } }
    const r = await pedirImagen(pedido(), (async () => ok(cuerpo)) as unknown as typeof fetch)
    if (!('sinImagen' in r)) throw new Error('esperaba sinImagen')
    expect(r.sinImagen.length).toBeLessThanOrEqual(200)
    expect(r.usage?.total_input_tokens).toBe(7)
  })

  it('sin errors ni imagen da un mensaje genérico', async () => {
    const r = await pedirImagen(pedido(), (async () => ok({ status: 'completed', steps: [] })) as unknown as typeof fetch)
    expect('sinImagen' in r && r.sinImagen.length > 0).toBe(true)
    expect(r.usage).toBeNull()
  })

  it('rechaza un mime que no es jpeg/png/webp', async () => {
    const cuerpo = { status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'image', data: b64([1]), mime_type: 'image/gif' }] }] }
    const r = await pedirImagen(pedido(), (async () => ok(cuerpo)) as unknown as typeof fetch)
    expect('sinImagen' in r).toBe(true)
  })

  it('rechaza una imagen de más de 10 MB', async () => {
    const grande = Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64')
    const cuerpo = { status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'image', data: grande, mime_type: 'image/jpeg' }] }] }
    const r = await pedirImagen(pedido(), (async () => ok(cuerpo)) as unknown as typeof fetch)
    expect('sinImagen' in r).toBe(true)
  })
})

describe('pedirImagen: errores (S7.5, R9.4)', () => {
  it('un HTTP 500 tira ErrorGemini con el mensaje de Google, sin la clave', async () => {
    const f = async () => ok({ error: { message: `falló con key=${CLAVE}`.replace(CLAVE, 'oculta') } }, 500)
    await expect(pedirImagen(pedido(), f as unknown as typeof fetch)).rejects.toMatchObject({ name: 'ErrorGemini', status: 500 })
  })

  it('un 429 sin JSON también tira ErrorGemini', async () => {
    const f = async () => new Response('Too many', { status: 429 })
    const e = await pedirImagen(pedido(), f as unknown as typeof fetch).catch((x) => x)
    expect(e).toBeInstanceOf(ErrorGemini)
    expect(e.status).toBe(429)
  })

  it('el mensaje de error se recorta y nunca contiene la clave aunque Google la repita', async () => {
    const f = async () => ok({ error: { message: `${CLAVE} ${'y'.repeat(600)}` } }, 400)
    const e = await pedirImagen(pedido(), f as unknown as typeof fetch).catch((x) => x)
    expect(e.message).not.toContain(CLAVE)
    expect(e.message.length).toBeLessThanOrEqual(300)
  })

  it('un timeout es ErrorGemini 504', async () => {
    const f = (_u: unknown, init: RequestInit) =>
      new Promise<Response>((_, rej) => init.signal!.addEventListener('abort', () => rej(init.signal!.reason)))
    const e = await pedirImagen(pedido({ timeoutMs: 5 }), f as unknown as typeof fetch).catch((x) => x)
    expect(e).toBeInstanceOf(ErrorGemini)
    expect(e.status).toBe(504)
  })

  it('un error de red es ErrorGemini 502 sin detalles sensibles', async () => {
    const f = async () => {
      throw new TypeError(`fetch failed ${CLAVE}`)
    }
    const e = await pedirImagen(pedido(), f as unknown as typeof fetch).catch((x) => x)
    expect(e).toBeInstanceOf(ErrorGemini)
    expect(e.status).toBe(502)
    expect(e.message).not.toContain(CLAVE)
  })
})
