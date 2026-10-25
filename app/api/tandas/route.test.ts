import { describe, it, expect, vi } from 'vitest'

const manejarCreacionTanda = vi.hoisted(() => vi.fn(async () => new Response('ok', { status: 201 })))
vi.mock('@/lib/promocion/tanda/crear', () => ({ manejarCreacionTanda }))

import { POST, maxDuration } from './route'

describe('POST /api/tandas', () => {
  it('delega con el request, el entorno y fetch', async () => {
    const request = new Request('https://app.ejemplo.com/api/tandas', { method: 'POST' })
    const r = await POST(request)
    expect(r.status).toBe(201)
    const [req, entorno, f] = manejarCreacionTanda.mock.calls[0] as unknown as [Request, unknown, unknown]
    expect(req).toBe(request)
    expect(entorno).toBe(process.env)
    expect(f).toBe(fetch)
  })
  it('no necesita mucho tiempo: no llama a ningún modelo', () => {
    expect(maxDuration).toBeLessThanOrEqual(30)
  })
})
