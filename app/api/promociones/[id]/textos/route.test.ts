import { describe, it, expect, vi } from 'vitest'

const manejarTextos = vi.hoisted(() => vi.fn(async () => new Response('ok', { status: 200 })))
vi.mock('@/lib/promocion/textos/endpoint', () => ({ manejarTextos }))

import { maxDuration, POST } from './route'

describe('POST /api/promociones/[id]/textos', () => {
  it('declara maxDuration 120 (OpenAI puede tardar hasta 90 s)', () => {
    expect(maxDuration).toBe(120)
  })

  it('espera los params y delega con el id, el entorno y fetch', async () => {
    const request = new Request('https://app.ejemplo.com/api/promociones/abc/textos', { method: 'POST' })
    const r = await POST(request, { params: Promise.resolve({ id: 'abc' }) })
    expect(r.status).toBe(200)
    const [req, id, entorno, f] = manejarTextos.mock.calls[0] as unknown as [Request, string, unknown, unknown]
    expect(req).toBe(request)
    expect(id).toBe('abc')
    expect(entorno).toBe(process.env)
    expect(f).toBe(fetch)
  })
})
