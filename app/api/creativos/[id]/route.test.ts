import { describe, it, expect, vi } from 'vitest'

const manejarElegir = vi.hoisted(() => vi.fn(async () => new Response('ok', { status: 200 })))
vi.mock('@/lib/productor/elegir', () => ({ manejarElegir }))

import { PATCH } from './route'

describe('PATCH /api/creativos/[id]', () => {
  it('espera params y delega con el id, el entorno y fetch', async () => {
    const request = new Request('https://app.ejemplo.com/api/creativos/abc', { method: 'PATCH' })
    const r = await PATCH(request, { params: Promise.resolve({ id: 'abc' }) })
    expect(r.status).toBe(200)
    const [req, id, entorno, f] = manejarElegir.mock.calls[0] as unknown as [Request, string, unknown, unknown]
    expect(req).toBe(request)
    expect(id).toBe('abc')
    expect(entorno).toBe(process.env)
    expect(f).toBe(fetch)
  })
})
