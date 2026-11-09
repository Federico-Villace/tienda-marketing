import { describe, it, expect, vi } from 'vitest'

const manejarFormatos = vi.hoisted(() => vi.fn(async () => new Response('ok', { status: 200 })))
vi.mock('@/lib/promocion/formatos', () => ({ manejarFormatos }))

import { maxDuration, POST } from './route'

describe('POST /api/promociones/[id]/formatos', () => {
  it('declara maxDuration 60', () => {
    expect(maxDuration).toBe(60)
  })
  it('espera los params y delega con el id, el entorno y fetch', async () => {
    const request = new Request('https://app.ejemplo.com/api/promociones/abc/formatos', { method: 'POST' })
    const r = await POST(request, { params: Promise.resolve({ id: 'abc' }) })
    expect(r.status).toBe(200)
    const [req, id, entorno, f] = manejarFormatos.mock.calls[0] as unknown as [Request, string, unknown, unknown]
    expect(req).toBe(request)
    expect(id).toBe('abc')
    expect(entorno).toBe(process.env)
    expect(f).toBe(fetch)
  })
})
