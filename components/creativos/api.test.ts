import { describe, it, expect, vi, afterEach } from 'vitest'
import { patchCreativo, postConfirmar, postEstimacion } from './api'

afterEach(() => vi.unstubAllGlobals())
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })

describe('postEstimacion', () => {
  it('manda solo piezaId, motor y cantidad y devuelve la estimación del servidor', async () => {
    const f = vi.fn(async () => json({ generacion: { id: 'g1', costoEstimadoUsd: 0.13 }, mes: { gastadoUsd: 1, topeUsd: 10 }, excedeTope: false }, 201))
    vi.stubGlobal('fetch', f)
    const r = await postEstimacion({ piezaId: 'p1', motor: 'gemini-nano-banana-2.1', cantidad: 3 })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/generaciones')
    expect(JSON.parse(String(init.body))).toEqual({ piezaId: 'p1', motor: 'gemini-nano-banana-2.1', cantidad: 3 })
    expect(r).toMatchObject({ ok: true, mes: { topeUsd: 10 }, excedeTope: false })
  })

  it('devuelve el error del servidor y nunca lanza ante un corte de red', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Productor apagado' }, 503)))
    expect(await postEstimacion({ piezaId: 'p', motor: 'm', cantidad: 1 })).toEqual({ ok: false, status: 503, error: 'Productor apagado' })
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('red'))))
    expect(await postEstimacion({ piezaId: 'p', motor: 'm', cantidad: 1 })).toMatchObject({ ok: false, status: 0 })
  })
})

describe('postConfirmar', () => {
  it('hace POST sin body al endpoint de la generación', async () => {
    const f = vi.fn(async () => json({ generacion: { id: 'g1', estado: 'ok', costoRealUsd: 0.1 }, creativos: [] }))
    vi.stubGlobal('fetch', f)
    const r = await postConfirmar('g1')
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/generaciones/g1/confirmar')
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
    expect(r).toMatchObject({ ok: true, generacion: { estado: 'ok' } })
  })

  it('en 402 trae el tope, lo gastado y lo que queda', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Supera el tope mensual.', topeUsd: 10, gastadoUsd: 9.95, restanteUsd: 0.05 }, 402)))
    expect(await postConfirmar('g1')).toEqual({ ok: false, status: 402, error: 'Supera el tope mensual.', restanteUsd: 0.05, topeUsd: 10 })
  })

  it('nunca lanza', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('red'))))
    expect(await postConfirmar('g1')).toMatchObject({ ok: false, status: 0 })
  })
})

describe('patchCreativo', () => {
  it('manda elegida y devuelve el creativo', async () => {
    const f = vi.fn(async () => json({ creativo: { id: 'c1', elegida: true } }))
    vi.stubGlobal('fetch', f)
    const r = await patchCreativo('c1', true)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/creativos/c1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toEqual({ elegida: true })
    expect(r).toEqual({ ok: true, creativo: { id: 'c1', elegida: true } })
  })

  it('error y red caída no lanzan', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'No' }, 403)))
    expect(await patchCreativo('c1', true)).toEqual({ ok: false, status: 403, error: 'No' })
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('red'))))
    expect(await patchCreativo('c1', true)).toMatchObject({ ok: false, status: 0 })
  })
})
