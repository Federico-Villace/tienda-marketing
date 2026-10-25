import { describe, it, expect, vi } from 'vitest'

const manejarAntecedentes = vi.hoisted(() => vi.fn(async () => new Response('ok', { status: 200 })))
vi.mock('@/lib/promocion/antecedentes/endpoint', () => ({ manejarAntecedentes }))

import { maxDuration, POST } from './route'

describe('POST /api/promociones/[id]/antecedentes', () => {
  it('declara maxDuration 120 (OpenAI puede tardar hasta 90 s)', () => {
    expect(maxDuration).toBe(120)
  })

  it('espera los params y delega con el id, el entorno, fetch y la fecha', async () => {
    const request = new Request('https://app.ejemplo.com/api/promociones/abc/antecedentes', { method: 'POST' })
    const r = await POST(request, { params: Promise.resolve({ id: 'abc' }) })
    expect(r.status).toBe(200)
    const [req, id, entorno, f, ahora] = manejarAntecedentes.mock.calls[0] as unknown as [Request, string, unknown, unknown, unknown]
    expect(req).toBe(request)
    expect(id).toBe('abc')
    expect(entorno).toBe(process.env)
    expect(f).toBe(fetch)
    expect(ahora).toBeInstanceOf(Date)
  })
})
