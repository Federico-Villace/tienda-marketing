import { describe, it, expect, vi } from 'vitest'

const manejarPlan = vi.hoisted(() => vi.fn(async () => new Response('ok', { status: 200 })))
vi.mock('@/lib/estratega/endpoint', () => ({ manejarPlan }))

import { maxDuration, POST } from './route'

describe('POST /api/planes', () => {
  it('declara maxDuration 120 (OpenAI puede tardar hasta 90 s)', () => {
    expect(maxDuration).toBe(120)
  })

  it('delega en manejarPlan con el request, el entorno y fetch', async () => {
    const request = new Request('https://app.ejemplo.com/api/planes', { method: 'POST' })
    const r = await POST(request)
    expect(r.status).toBe(200)
    const [req, entorno, f] = manejarPlan.mock.calls[0] as unknown as [Request, unknown, unknown]
    expect(req).toBe(request)
    expect(entorno).toBe(process.env)
    expect(f).toBe(fetch)
  })
})
