import { describe, it, expect, vi } from 'vitest'

const manejar = vi.hoisted(() => vi.fn(async () => new Response('ok', { status: 200 })))
vi.mock('@/lib/productor/lote/ejecutar', () => ({ manejarEjecucion: manejar }))

import { maxDuration, POST } from './route'

describe('POST /api/generaciones/[id]/ejecutar', () => {
  it('declara maxDuration 300', () => {
    expect(maxDuration).toBe(300)
  })

  it('espera params (Promise en Next 16) y delega con el id', async () => {
    const request = new Request('https://app.ejemplo.com/x', { method: 'POST' })
    const r = await POST(request, { params: Promise.resolve({ id: 'abc' }) })
    expect(r.status).toBe(200)
    const llamada = manejar.mock.calls[0] as unknown as unknown[]
    expect(llamada[0]).toBe(request)
    expect(llamada[1]).toBe('abc')
    expect(llamada.at(-2)).toBe(process.env)
    expect(llamada.at(-1)).toBe(fetch)
  })
})
