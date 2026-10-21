import { describe, it, expect, vi } from 'vitest'

const manejarTanda = vi.hoisted(() => vi.fn(async () => new Response('ok', { status: 200 })))
vi.mock('@/lib/contenidista/endpoint', () => ({ manejarTanda }))

import { maxDuration, POST } from './route'

describe('POST /api/contenido', () => {
  it('declara maxDuration 120 (OpenAI puede tardar hasta 90 s)', () => {
    expect(maxDuration).toBe(120)
  })

  it('delega en manejarTanda con el request, el entorno y fetch', async () => {
    const request = new Request('https://app.ejemplo.com/api/contenido', { method: 'POST' })
    const r = await POST(request)
    expect(r.status).toBe(200)
    const [req, entorno, f] = manejarTanda.mock.calls[0] as unknown as [Request, unknown, unknown]
    expect(req).toBe(request)
    expect(entorno).toBe(process.env)
    expect(f).toBe(fetch)
  })
})
