import { describe, it, expect, vi } from 'vitest'

const manejarLectura = vi.hoisted(() => vi.fn(async () => new Response('ok', { status: 200 })))
vi.mock('@/lib/promocion/referencia/endpoint', () => ({ manejarLectura }))

import { maxDuration, POST } from './route'

describe('POST /api/promociones/[id]/referencia', () => {
  it('declara maxDuration 90 (Gemini tiene 60 s de timeout y queda margen para la base)', () => {
    expect(maxDuration).toBe(90)
  })

  it('espera los params y delega con el id, el entorno y fetch', async () => {
    const request = new Request('https://app.ejemplo.com/api/promociones/abc/referencia', { method: 'POST' })
    const r = await POST(request, { params: Promise.resolve({ id: 'abc' }) })
    expect(r.status).toBe(200)
    const [req, id, entorno, f] = manejarLectura.mock.calls[0] as unknown as [Request, string, unknown, unknown]
    expect(req).toBe(request)
    expect(id).toBe('abc')
    expect(entorno).toBe(process.env)
    expect(f).toBe(fetch)
  })
})
