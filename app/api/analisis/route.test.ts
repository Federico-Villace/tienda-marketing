import { describe, it, expect, vi } from 'vitest'

const manejarAnalisis = vi.hoisted(() => vi.fn(async () => new Response('ok', { status: 200 })))
vi.mock('@/lib/analista/endpoint', () => ({ manejarAnalisis }))

import { maxDuration, POST } from './route'

describe('POST /api/analisis', () => {
  it('declara maxDuration 120 (OpenAI puede tardar hasta 90 s)', () => {
    expect(maxDuration).toBe(120)
  })

  it('delega en manejarAnalisis con el request, el entorno y fetch', async () => {
    const request = new Request('https://app.ejemplo.com/api/analisis', { method: 'POST' })
    const r = await POST(request)
    expect(r.status).toBe(200)
    expect(manejarAnalisis).toHaveBeenCalledTimes(1)
    const [req, entorno, f, ahora] = manejarAnalisis.mock.calls[0] as unknown as [Request, unknown, unknown, unknown]
    expect(req).toBe(request)
    expect(entorno).toBe(process.env)
    expect(f).toBe(fetch)
    expect(ahora).toBeInstanceOf(Date)
  })
})
