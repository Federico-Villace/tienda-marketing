import { describe, it, expect, vi, afterEach } from 'vitest'
import { patchPieza, postTanda } from './api'

afterEach(() => vi.unstubAllGlobals())
const r = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })

describe('postTanda', () => {
  it('manda POST /api/contenido y devuelve tanda, piezas y desdeCache', async () => {
    const f = vi.fn(async () => r({ tanda: { id: 't' }, piezas: [], desdeCache: true }))
    vi.stubGlobal('fetch', f)
    const x = await postTanda({ plan_id: 'p', semana: 1, notas: null })
    expect(x).toMatchObject({ ok: true, desdeCache: true })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/contenido')
    expect(init.method).toBe('POST')
  })
  it('nunca lanza: un error de la API o de red vuelve como { ok:false }', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => r({ error: 'tope' }, 422)))
    expect(await postTanda({ plan_id: 'p', semana: 1, notas: null })).toMatchObject({ ok: false, status: 422, error: 'tope' })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('x') }))
    expect(await postTanda({ plan_id: 'p', semana: 1, notas: null })).toMatchObject({ ok: false, status: 0 })
  })
})

describe('patchPieza', () => {
  it('manda PATCH /api/piezas/[id]', async () => {
    const f = vi.fn(async () => r({ pieza: { id: 'z' } }))
    vi.stubGlobal('fetch', f)
    expect(await patchPieza('z', { accion: 'aprobar', version: 1 })).toMatchObject({ ok: true })
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[0]).toBe('/api/piezas/z')
  })
  it('devuelve los errores del validador y el status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => r({ error: 'no válida', errores: ['"copy" muy largo'] }, 422)))
    expect(await patchPieza('z', {})).toMatchObject({ ok: false, status: 422, errores: ['"copy" muy largo'] })
  })
  it('nunca lanza', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('x') }))
    expect(await patchPieza('z', {})).toMatchObject({ ok: false, status: 0 })
  })
})
