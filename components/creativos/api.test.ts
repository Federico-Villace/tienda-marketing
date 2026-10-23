import { describe, it, expect, vi, afterEach } from 'vitest'
import { deleteFoto, patchCreativo, postConfirmar, postEstimacion, postEstimacionFoto, postFoto } from './api'

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

describe('postFoto (F13)', () => {
  const formulario = () => {
    const fd = new FormData()
    fd.set('foto', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), 'foto.jpg')
    fd.set('derechos', 'acepto')
    return fd
  }

  it('hace POST multipart a /api/fotos SIN fijar content-type (lo arma el navegador con el boundary)', async () => {
    const f = vi.fn(async () => json({ foto: { id: 'f1', ancho: 1536, alto: 2048, url: 'https://x/f1.jpg' } }, 201))
    vi.stubGlobal('fetch', f)
    const fd = formulario()
    const r = await postFoto(fd)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/fotos')
    expect(init.method).toBe('POST')
    expect(init.body).toBe(fd)
    expect(init.headers).toBeUndefined()
    expect(r).toEqual({ ok: true, foto: { id: 'f1', ancho: 1536, alto: 2048, url: 'https://x/f1.jpg' } })
  })

  it.each([413, 415, 422])('el %s trae el mensaje del servidor y el status', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Mensaje del servidor' }, status)))
    expect(await postFoto(formulario())).toEqual({ ok: false, status, error: 'Mensaje del servidor' })
  })

  it('un cuerpo que no es JSON (p. ej. el 413 de Vercel) igual da un error legible', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Request Entity Too Large', { status: 413 })))
    const r = await postFoto(formulario())
    expect(r).toMatchObject({ ok: false, status: 413 })
    if (!r.ok) expect(r.error).toMatch(/pesa demasiado/i)
  })

  it('nunca lanza ante un corte de red', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('red'))))
    expect(await postFoto(formulario())).toMatchObject({ ok: false, status: 0 })
  })
})

describe('deleteFoto (F13)', () => {
  it('hace DELETE a /api/fotos/[id] y devuelve pendiente', async () => {
    const f = vi.fn(async () => json({ ok: true, pendiente: true }))
    vi.stubGlobal('fetch', f)
    const r = await deleteFoto('f1')
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/fotos/f1')
    expect(init.method).toBe('DELETE')
    expect(r).toEqual({ ok: true, pendiente: true })
  })

  it('error y red caída no lanzan', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'No' }, 403)))
    expect(await deleteFoto('f1')).toEqual({ ok: false, status: 403, error: 'No' })
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('red'))))
    expect(await deleteFoto('f1')).toMatchObject({ ok: false, status: 0 })
  })
})

describe('postEstimacionFoto (F13)', () => {
  it('manda solo fotoId, edicion, aspecto, motor y cantidad, nunca un precio', async () => {
    const f = vi.fn(async () => json({ generacion: { id: 'g1', costoEstimadoUsd: 0.09 }, mes: { gastadoUsd: 1, topeUsd: 10 }, excedeTope: false }, 201))
    vi.stubGlobal('fetch', f)
    const r = await postEstimacionFoto({ fotoId: 'f1', edicion: 'fondo_estudio', aspecto: '4:5', motor: 'gemini-nano-banana-2.1', cantidad: 2 })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/generaciones')
    expect(JSON.parse(String(init.body))).toEqual({ fotoId: 'f1', edicion: 'fondo_estudio', aspecto: '4:5', motor: 'gemini-nano-banana-2.1', cantidad: 2 })
    expect(r).toMatchObject({ ok: true, mes: { topeUsd: 10 } })
  })

  it('devuelve el error del servidor (410 foto borrada) y nunca lanza', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'La foto se borró.' }, 410)))
    expect(await postEstimacionFoto({ fotoId: 'f', edicion: 'solo_formato', aspecto: '1:1', motor: 'm', cantidad: 1 })).toEqual({ ok: false, status: 410, error: 'La foto se borró.' })
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('red'))))
    expect(await postEstimacionFoto({ fotoId: 'f', edicion: 'solo_formato', aspecto: '1:1', motor: 'm', cantidad: 1 })).toMatchObject({ ok: false, status: 0 })
  })
})
