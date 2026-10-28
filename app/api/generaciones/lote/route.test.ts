import { describe, it, expect, vi } from 'vitest'

const manejar = vi.hoisted(() => vi.fn(async () => new Response('ok', { status: 200 })))
vi.mock('@/lib/productor/lote/estimar', () => ({ manejarEstimacionLote: manejar }))

import { maxDuration, POST } from './route'

describe('POST /api/generaciones/lote', () => {
  it('declara maxDuration 30', () => {
    expect(maxDuration).toBe(30)
  })

  it('delega con el entorno y fetch', async () => {
    const request = new Request('https://app.ejemplo.com/x', { method: 'POST' })
    const r = await POST(request)
    expect(r.status).toBe(200)
    const llamada = manejar.mock.calls[0] as unknown as unknown[]
    expect(llamada[0]).toBe(request)

    expect(llamada.at(-2)).toBe(process.env)
    expect(llamada.at(-1)).toBe(fetch)
  })
})
