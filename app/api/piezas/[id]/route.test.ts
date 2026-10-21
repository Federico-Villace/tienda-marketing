import { describe, it, expect, vi } from 'vitest'

const manejarCambioPieza = vi.hoisted(() => vi.fn(async () => new Response('ok', { status: 200 })))
vi.mock('@/lib/contenidista/cambios', () => ({ manejarCambioPieza }))

import { PATCH } from './route'

describe('PATCH /api/piezas/[id]', () => {
  it('espera los params (Promise), y delega con el id, el entorno y fetch', async () => {
    const request = new Request('https://app.ejemplo.com/api/piezas/abc', { method: 'PATCH' })
    const r = await PATCH(request, { params: Promise.resolve({ id: 'abc' }) })
    expect(r.status).toBe(200)
    const [req, id, entorno, f] = manejarCambioPieza.mock.calls[0] as unknown as [Request, string, unknown, unknown]
    expect(req).toBe(request)
    expect(id).toBe('abc')
    expect(entorno).toBe(process.env)
    expect(f).toBe(fetch)
  })
})
