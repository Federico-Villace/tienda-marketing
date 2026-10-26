import { describe, it, expect, vi, afterEach } from 'vitest'
import { patchAnalisis, patchPromocion, postAntecedentes, postPlaca, postPromocion, postTanda, postTextos } from './api'

afterEach(() => vi.unstubAllGlobals())
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const pedido = { marcaId: 'm', modelo: 'TRK 502', precio: { moneda: 'ARS' as const, monto: 1 }, promo: { tipo: 'contado' as const, detalle: '' }, lugar: '', indicaciones: '', fotoId: 'f', aspecto: '4:5' as const }

describe('postPromocion', () => {
  it('manda el pedido tal cual y devuelve la promoción', async () => {
    const f = vi.fn(async () => json({ promocion: { id: 'p1' } }, 201))
    vi.stubGlobal('fetch', f)
    const r = await postPromocion(pedido)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/promociones')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual(pedido)
    expect(r).toEqual({ ok: true, promocion: { id: 'p1' }, avisos: [] })
  })
  it('un 400 trae la lista de errores', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Revisá los datos.', errores: ['Falta la foto.'] }, 400)))
    expect(await postPromocion(pedido)).toEqual({ ok: false, status: 400, error: 'Revisá los datos.', errores: ['Falta la foto.'] })
  })
  it('nunca lanza ante un corte de red', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('red'))))
    expect(await postPromocion(pedido)).toMatchObject({ ok: false, status: 0 })
  })
})

describe('patchPromocion', () => {
  it('hace PATCH al id con la revisión y los avisos del servidor', async () => {
    const f = vi.fn(async () => json({ promocion: { id: 'p1', revision: 3 }, avisos: ['Cambiaste el formato'] }))
    vi.stubGlobal('fetch', f)
    const r = await patchPromocion('p1', { revision: 2, aspecto: '9:16' })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/promociones/p1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toEqual({ revision: 2, aspecto: '9:16' })
    expect(r).toEqual({ ok: true, promocion: { id: 'p1', revision: 3 }, avisos: ['Cambiaste el formato'] })
  })
  it('un 409 sale con su mensaje', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Esta promoción cambió: recargá la pantalla.' }, 409)))
    expect(await patchPromocion('p1', { revision: 1, accion: 'aprobar' })).toMatchObject({ ok: false, status: 409, error: 'Esta promoción cambió: recargá la pantalla.' })
  })
})

describe('postAntecedentes / postTextos / postPlaca', () => {
  it('antecedentes: POST sin body y devuelve el análisis', async () => {
    const f = vi.fn(async () => json({ analisis: { id: 'a1' }, desdeCache: false, promocion: { id: 'p1' } }))
    vi.stubGlobal('fetch', f)
    const r = await postAntecedentes('p1')
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[0]).toBe('/api/promociones/p1/antecedentes')
    expect(r).toMatchObject({ ok: true, analisis: { id: 'a1' }, desdeCache: false })
  })
  it('antecedentes: con período manda desde/hasta', async () => {
    const f = vi.fn(async () => json({ analisis: { id: 'a1' }, desdeCache: false, promocion: { id: 'p1' } }))
    vi.stubGlobal('fetch', f)
    await postAntecedentes('p1', { desde: '2026-09-01', hasta: '2026-09-30' })
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' })
  })
  it('antecedentes: el 422 sin datos se muestra en castellano', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Todavía no hay resultados de Benelli para comparar. Podés seguir sin este paso.' }, 422)))
    expect(await postAntecedentes('p1')).toMatchObject({ ok: false, status: 422, error: expect.stringContaining('seguir sin este paso') })
  })
  it('textos: manda la revisión y "otras"', async () => {
    const f = vi.fn(async () => json({ textos: { id: 't1', opciones: [] }, promocion: { id: 'p1' } }))
    vi.stubGlobal('fetch', f)
    await postTextos('p1', { revision: 4, otras: true })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/promociones/p1/textos')
    expect(JSON.parse(String(init.body))).toEqual({ revision: 4, otras: true })
  })
  it('placa: manda la revisión', async () => {
    const f = vi.fn(async () => json({ url: 'https://x/p.png', hash: 'h', reutilizada: false, promocion: { id: 'p1' } }))
    vi.stubGlobal('fetch', f)
    const r = await postPlaca('p1', { revision: 4 })
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ revision: 4 })
    expect(r).toMatchObject({ ok: true, url: 'https://x/p.png' })
  })
  it('una respuesta que no es JSON (413, 504) da un mensaje en castellano', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 504 })))
    const r = await postTextos('p1', { revision: 1 })
    expect(r).toMatchObject({ ok: false, status: 504 })
    expect((r as { error: string }).error).toMatch(/Probá de nuevo/)
  })
})

describe('patchAnalisis', () => {
  it('edita el análisis con su versión', async () => {
    const f = vi.fn(async () => json({ analisis: { id: 'a1', version: 2 } }))
    vi.stubGlobal('fetch', f)
    const r = await patchAnalisis('a1', { version: 1, contenido: 'nuevo' })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/analisis/a1')
    expect(JSON.parse(String(init.body))).toEqual({ version: 1, contenido: 'nuevo' })
    expect(r).toMatchObject({ ok: true, analisis: { version: 2 } })
  })
})

describe('postTanda', () => {
  const pedido = { marcaIds: ['a', 'b'], modelo: 'TRK 502', precio: { moneda: 'ARS' as const, monto: 1 }, promo: { tipo: 'contado' as const, detalle: '' }, lugar: 'Quilmes', indicaciones: '', fotoId: 'f1', aspecto: '4:5' as const }

  it('POST /api/tandas con el pedido tal cual y devuelve la tanda y las promociones', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ tanda: { id: 't1' }, promociones: [{ id: 'p1' }, { id: 'p2' }] }), { status: 201 }))
    vi.stubGlobal('fetch', f)
    const r = await postTanda(pedido)
    expect(r).toMatchObject({ ok: true, tanda: { id: 't1' } })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/tandas')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual(pedido)
  })

  it('un error del servidor llega con su mensaje y la lista; un fallo de red es status 0', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Alguna de esas marcas ya está en la tanda.' }), { status: 409 })))
    expect(await postTanda(pedido)).toEqual({ ok: false, status: 409, error: 'Alguna de esas marcas ya está en la tanda.' })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('red') }))
    expect(await postTanda(pedido)).toMatchObject({ ok: false, status: 0 })
  })
})
