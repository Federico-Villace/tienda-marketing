import { describe, it, expect, vi } from 'vitest'
import { pedirImagen, type PedidoImagen } from './gemini'

const CLAVE = 'AIza-clave-secreta-123'
const b64 = (bytes: number[]) => Buffer.from(bytes).toString('base64')
const img = (...b: number[]) => ({ bytes: Uint8Array.from([0xff, 0xd8, 0xff, ...b]), mimeType: 'image/jpeg' as const })
const pedido = (o: Partial<PedidoImagen> = {}): PedidoImagen => ({ apiKey: CLAVE, modelo: 'gemini-3-pro-image', prompt: 'varias motos', aspecto: '4:5', pensamiento: null, ...o })
const ok = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status })
const conImagen = () => ({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'image', data: b64([0xff, 0xd8, 0xff, 0xd9]), mime_type: 'image/jpeg' }] }], usage: { total_input_tokens: 10, total_output_tokens: 1120 } })
const cuerpoDe = (f: ReturnType<typeof vi.fn>) => JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))

describe('pedirImagen con varias motos (ADR-041)', () => {
  it('el orden es: texto, moto 1, motos 2..N y, AL FINAL, la referencia', async () => {
    const f = vi.fn(async () => ok(conImagen()))
    await pedirImagen(pedido({ imagenEntrada: img(1), imagenesExtra: [img(2), img(3)], imagenReferencia: img(9) }), f as unknown as typeof fetch)
    expect(cuerpoDe(f).input).toEqual([
      { type: 'text', text: 'varias motos' },
      { type: 'image', mime_type: 'image/jpeg', data: b64([0xff, 0xd8, 0xff, 1]) },
      { type: 'image', mime_type: 'image/jpeg', data: b64([0xff, 0xd8, 0xff, 2]) },
      { type: 'image', mime_type: 'image/jpeg', data: b64([0xff, 0xd8, 0xff, 3]) },
      { type: 'image', mime_type: 'image/jpeg', data: b64([0xff, 0xd8, 0xff, 9]) },
    ])
  })
  it('tres motos y la referencia: 5 imágenes de entrada con 4 motos', async () => {
    const f = vi.fn(async () => ok(conImagen()))
    await pedirImagen(pedido({ imagenEntrada: img(1), imagenesExtra: [img(2), img(3), img(4)], imagenReferencia: img(9) }), f as unknown as typeof fetch)
    expect(cuerpoDe(f).input.filter((x: { type: string }) => x.type === 'image')).toHaveLength(5)
  })
  it('sin extras, el pedido es el de siempre', async () => {
    const f = vi.fn(async () => ok(conImagen()))
    await pedirImagen(pedido({ imagenEntrada: img(1), imagenesExtra: [], imagenReferencia: img(9) }), f as unknown as typeof fetch)
    expect(cuerpoDe(f).input).toHaveLength(3)
  })
  it('las extras no se mandan sin la foto de la moto principal (la primera imagen es siempre la moto 1)', async () => {
    const f = vi.fn(async () => ok(conImagen()))
    await pedirImagen(pedido({ imagenesExtra: [img(2)] }), f as unknown as typeof fetch)
    expect(cuerpoDe(f).input).toBe('varias motos')
  })
  it('ningún error lleva el base64 de las fotos extra ni la clave', async () => {
    const extra = b64([0xff, 0xd8, 0xff, 2])
    const f = async () => ok({ error: { message: `mala request ${extra} ${CLAVE}` } }, 400)
    const e = await pedirImagen(pedido({ imagenEntrada: img(1), imagenesExtra: [img(2)], imagenReferencia: img(9) }), f as unknown as typeof fetch).catch((x) => x)
    expect(e.message).not.toContain(extra)
    expect(e.message).not.toContain(CLAVE)
    const sin = await pedirImagen(pedido({ imagenEntrada: img(1), imagenesExtra: [img(2)] }), (async () => ok({ status: 'completed', steps: [], errors: [{ message: `bloqueada ${extra}` }] })) as unknown as typeof fetch)
    expect('sinImagen' in sin && sin.sinImagen).not.toContain(extra)
  })
})
