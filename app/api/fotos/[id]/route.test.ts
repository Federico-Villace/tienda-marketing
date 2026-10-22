import { describe, it, expect, vi } from 'vitest'

const manejarBorradoFoto = vi.hoisted(() => vi.fn(async () => new Response('ok', { status: 200 })))
vi.mock('@/lib/productor/borrar-foto', () => ({ manejarBorradoFoto }))

import { DELETE } from './route'

describe('DELETE /api/fotos/[id]', () => {
  it('espera params y delega con el id, el entorno y fetch', async () => {
    const request = new Request('https://app.ejemplo.com/api/fotos/abc', { method: 'DELETE' })
    const r = await DELETE(request, { params: Promise.resolve({ id: 'abc' }) })
    expect(r.status).toBe(200)
    const [req, id, entorno, f] = manejarBorradoFoto.mock.calls[0] as unknown as [Request, string, unknown, unknown]
    expect(req).toBe(request)
    expect(id).toBe('abc')
    expect(entorno).toBe(process.env)
    expect(f).toBe(fetch)
  })
})
