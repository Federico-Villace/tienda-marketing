import { describe, it, expect, vi } from 'vitest'

const manejarPlaca = vi.hoisted(() => vi.fn(async () => new Response('ok', { status: 200 })))
vi.mock('@/lib/promocion/placa', () => ({ manejarPlaca }))

import { maxDuration, POST } from './route'

describe('POST /api/promociones/[id]/placa', () => {
  it('declara maxDuration 60: componer el PNG y subirlo tarda unos segundos', () => {
    expect(maxDuration).toBe(60)
  })

  it('espera los params y delega con el id, el entorno y fetch', async () => {
    const request = new Request('https://app.ejemplo.com/api/promociones/abc/placa', { method: 'POST' })
    const r = await POST(request, { params: Promise.resolve({ id: 'abc' }) })
    expect(r.status).toBe(200)
    const [req, id, entorno, f] = manejarPlaca.mock.calls[0] as unknown as [Request, string, unknown, unknown]
    expect(req).toBe(request)
    expect(id).toBe('abc')
    expect(entorno).toBe(process.env)
    expect(f).toBe(fetch)
  })
})
