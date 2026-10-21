import { describe, it, expect, vi } from 'vitest'

const manejarConfirmacion = vi.hoisted(() => vi.fn(async () => new Response('ok', { status: 200 })))
vi.mock('@/lib/productor/confirmar', () => ({ manejarConfirmacion }))

import { maxDuration, POST } from './route'

describe('POST /api/generaciones/[id]/confirmar', () => {
  it('declara maxDuration 300: son hasta 4 imágenes de hasta 120 s en paralelo', () => {
    expect(maxDuration).toBe(300)
  })

  it('espera params (Promise en Next 16) y delega con el id, el entorno y fetch', async () => {
    const request = new Request('https://app.ejemplo.com/api/generaciones/abc/confirmar', { method: 'POST' })
    const r = await POST(request, { params: Promise.resolve({ id: 'abc' }) })
    expect(r.status).toBe(200)
    const [req, id, entorno, f] = manejarConfirmacion.mock.calls[0] as unknown as [Request, string, unknown, unknown]
    expect(req).toBe(request)
    expect(id).toBe('abc')
    expect(entorno).toBe(process.env)
    expect(f).toBe(fetch)
  })
})
