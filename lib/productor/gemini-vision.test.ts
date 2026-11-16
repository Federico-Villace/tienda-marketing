import { describe, it, expect, vi } from 'vitest'
import { ErrorGemini } from './gemini'
import { pedirJsonConImagen, type PedidoVision } from './gemini-vision'

const CLAVE = 'AIza-clave-secreta-123'
const FOTO = Uint8Array.from([0xff, 0xd8, 0xff, 0x01, 0x02, 0x03])
const FOTO_B64 = Buffer.from(FOTO).toString('base64')

const pedido = (o: Partial<PedidoVision> = {}): PedidoVision => ({
  apiKey: CLAVE,
  modelo: 'gemini-4-carbon',
  prompt: 'leé la placa',
  imagen: { bytes: FOTO, mimeType: 'image/jpeg' },
  tokensSalidaTope: 3000,
  pensamiento: 'low',
  ...o,
})
const ok = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status })
const conTexto = (texto: string, extra: object = {}) => ({
  status: 'completed',
  steps: [{ type: 'thought', content: [{ type: 'text', text: 'pensando…' }] }, { type: 'model_output', content: [{ type: 'text', text: texto }] }],
  usage: { total_input_tokens: 2600, total_output_tokens: 700, total_thought_tokens: 200 },
  ...extra,
})
const cuerpoDe = (f: ReturnType<typeof vi.fn>) => JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))

describe('pedirJsonConImagen: el pedido', () => {
  it('POST a interactions con la clave SOLO en el header, store:false, la imagen en base64 y el tope de salida', async () => {
    const f = vi.fn(async () => ok(conTexto('{}')))
    await pedirJsonConImagen(pedido(), f as unknown as typeof fetch)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/interactions')
    expect(String(url)).not.toContain(CLAVE)
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(CLAVE)
    expect(String(init.body)).not.toContain(CLAVE)
    expect(cuerpoDe(f)).toEqual({
      model: 'gemini-4-carbon',
      input: [
        { type: 'text', text: 'leé la placa' },
        { type: 'image', mime_type: 'image/jpeg', data: FOTO_B64 },
      ],
      generation_config: { max_output_tokens: 3000, thinking_level: 'low' },
      store: false,
    })
  })

  it('sin pensamiento no manda thinking_level, pero el tope de salida va SIEMPRE', async () => {
    const f = vi.fn(async () => ok(conTexto('{}')))
    await pedirJsonConImagen(pedido({ pensamiento: null }), f as unknown as typeof fetch)
    expect(cuerpoDe(f).generation_config).toEqual({ max_output_tokens: 3000 })
  })

  it('el cuerpo no manda response_format de imagen (la salida es texto)', async () => {
    const f = vi.fn(async () => ok(conTexto('{}')))
    await pedirJsonConImagen(pedido(), f as unknown as typeof fetch)
    expect(cuerpoDe(f).response_format).toBeUndefined()
  })
})

describe('pedirJsonConImagen: la respuesta', () => {
  it('devuelve el texto del modelo (ignora los pasos de pensamiento) y el usage', async () => {
    const f = vi.fn(async () => ok(conTexto('{"utilizable":true}')))
    const r = await pedirJsonConImagen(pedido(), f as unknown as typeof fetch)
    expect(r.texto).toBe('{"utilizable":true}')
    expect(r.usage).toEqual({ total_input_tokens: 2600, total_output_tokens: 700, total_thought_tokens: 200 })
  })

  it('une varios bloques de texto del mismo paso', async () => {
    const f = vi.fn(async () => ok({ steps: [{ type: 'model_output', content: [{ type: 'text', text: '{"a":' }, { type: 'text', text: '1}' }] }], usage: {} }))
    expect((await pedirJsonConImagen(pedido(), f as unknown as typeof fetch)).texto).toBe('{"a":1}')
  })

  it('sin texto devuelve "" (con su usage: Google lo cobró igual)', async () => {
    const f = vi.fn(async () => ok({ steps: [], usage: { total_input_tokens: 2600 } }))
    const r = await pedirJsonConImagen(pedido(), f as unknown as typeof fetch)
    expect(r.texto).toBe('')
    expect(r.usage).toEqual({ total_input_tokens: 2600 })
  })

  it('sin usage devuelve null (el costo real cuenta el tope)', async () => {
    const f = vi.fn(async () => ok({ steps: [{ type: 'model_output', content: [{ type: 'text', text: '{}' }] }] }))
    expect((await pedirJsonConImagen(pedido(), f as unknown as typeof fetch)).usage).toBeNull()
  })
})

describe('pedirJsonConImagen: errores (nunca filtran la clave ni la foto)', () => {
  it('un error de Google lleva el status y enmascara la clave y la foto aunque Google las repita', async () => {
    const f = vi.fn(async () => ok({ error: { message: `bad ${CLAVE} ${FOTO_B64}` } }, 400))
    const e = await pedirJsonConImagen(pedido(), f as unknown as typeof fetch).catch((x) => x)
    expect(e).toBeInstanceOf(ErrorGemini)
    expect(e.status).toBe(400)
    expect(e.message).not.toContain(CLAVE)
    expect(e.message).not.toContain(FOTO_B64)
    expect(e.message).toContain('[clave]')
    expect(e.message.length).toBeLessThan(260)
  })

  it('un timeout es 504 y una falla de red es 502, sin el mensaje original', async () => {
    const tiempo = Object.assign(new Error(`fetch ${CLAVE}`), { name: 'TimeoutError' })
    const e1 = await pedirJsonConImagen(pedido(), (async () => { throw tiempo }) as unknown as typeof fetch).catch((x) => x)
    expect(e1.status).toBe(504)
    const e2 = await pedirJsonConImagen(pedido(), (async () => { throw new Error(`boom ${CLAVE}`) }) as unknown as typeof fetch).catch((x) => x)
    expect(e2.status).toBe(502)
    expect(e2.message).not.toContain(CLAVE)
  })

  it('una respuesta que no es JSON es 502', async () => {
    const e = await pedirJsonConImagen(pedido(), (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch).catch((x) => x)
    expect(e).toBeInstanceOf(ErrorGemini)
    expect(e.status).toBe(502)
  })

  it('usa un timeout propio (por defecto 60 s)', async () => {
    const espiar = vi.spyOn(AbortSignal, 'timeout')
    await pedirJsonConImagen(pedido(), (async () => ok(conTexto('{}'))) as unknown as typeof fetch)
    expect(espiar).toHaveBeenCalledWith(60_000)
    espiar.mockRestore()
  })
})
