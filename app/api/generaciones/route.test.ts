import { describe, it, expect, vi } from 'vitest'

const manejarEstimacion = vi.hoisted(() => vi.fn(async () => new Response('ok', { status: 201 })))
vi.mock('@/lib/productor/estimacion', () => ({ manejarEstimacion }))

import { maxDuration, POST } from './route'

describe('POST /api/generaciones', () => {
  it('declara maxDuration 30: estimar no llama a Gemini', () => {
    expect(maxDuration).toBe(30)
  })

  it('delega en manejarEstimacion con el request, el entorno y fetch', async () => {
    const request = new Request('https://app.ejemplo.com/api/generaciones', { method: 'POST' })
    const r = await POST(request)
    expect(r.status).toBe(201)
    const [req, entorno, f] = manejarEstimacion.mock.calls[0] as unknown as [Request, unknown, unknown]
    expect(req).toBe(request)
    expect(entorno).toBe(process.env)
    expect(f).toBe(fetch)
  })
})
