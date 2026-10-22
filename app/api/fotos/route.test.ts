import { describe, it, expect, vi } from 'vitest'

const manejarSubidaFoto = vi.hoisted(() => vi.fn(async () => new Response('ok', { status: 201 })))
vi.mock('@/lib/productor/subir-foto', () => ({ manejarSubidaFoto }))

import { maxDuration, POST } from './route'

describe('POST /api/fotos', () => {
  it('delega con el entorno y fetch, y fija maxDuration en 30', async () => {
    const request = new Request('https://app.ejemplo.com/api/fotos', { method: 'POST' })
    const r = await POST(request)
    expect(r.status).toBe(201)
    const [req, entorno, f] = manejarSubidaFoto.mock.calls[0] as unknown as [Request, unknown, unknown]
    expect(req).toBe(request)
    expect(entorno).toBe(process.env)
    expect(f).toBe(fetch)
    expect(maxDuration).toBe(30)
  })
})
