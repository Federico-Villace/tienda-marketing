import { describe, it, expect, vi } from 'vitest'

const manejarRecurso = vi.hoisted(() => vi.fn(async () => new Response('ok', { status: 200 })))
vi.mock('@/lib/promocion/recursos-placa', () => ({ manejarRecurso }))

import { GET } from './route'

describe('GET /api/placa-recursos/[id]', () => {
  it('espera los params y delega con el request y el id', async () => {
    const request = new Request('https://app.ejemplo.com/api/placa-recursos/logo999')
    const r = await GET(request, { params: Promise.resolve({ id: 'logo999' }) })
    expect(r.status).toBe(200)
    expect(manejarRecurso).toHaveBeenCalledWith(request, 'logo999')
  })
})
