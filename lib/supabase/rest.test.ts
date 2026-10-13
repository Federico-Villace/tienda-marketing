import { describe, it, expect, vi } from 'vitest'
import { actualizar, ErrorSupabase, insertar, rpc, seleccionar, upsert } from './rest'

const s = { url: 'https://abc.supabase.co', secretKey: 'sb_secret_xyz' }

const responder = (cuerpo: unknown, status = 200) =>
  vi.fn<typeof fetch>(async () => new Response(JSON.stringify(cuerpo), { status }))

const llamada = (f: ReturnType<typeof responder>, n = 0) => {
  const [url, init] = f.mock.calls[n]!
  return {
    url: new URL(String(url)),
    metodo: init?.method,
    headers: new Headers(init?.headers),
    cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined,
  }
}

describe('upsert', () => {
  it('hace POST con on_conflict y merge-duplicates, y devuelve las filas', async () => {
    const f = responder([{ id: 'u1' }])
    const filas = await upsert(s, 'campanias', [{ a: 1 }], 'cuenta_id,meta_campaign_id', f)

    expect(filas).toEqual([{ id: 'u1' }])
    const c = llamada(f)
    expect(c.metodo).toBe('POST')
    expect(c.url.pathname).toBe('/rest/v1/campanias')
    expect(c.url.searchParams.get('on_conflict')).toBe('cuenta_id,meta_campaign_id')
    expect(c.headers.get('apikey')).toBe('sb_secret_xyz')
    expect(c.headers.get('prefer')).toBe('resolution=merge-duplicates,return=representation')
    expect(c.cuerpo).toEqual([{ a: 1 }])
  })

  it('no llama a la base si no hay filas', async () => {
    const f = responder([])
    expect(await upsert(s, 'campanias', [], 'id', f)).toEqual([])
    expect(f).not.toHaveBeenCalled()
  })

  it('parte en tandas para no mandar cuerpos gigantes', async () => {
    const f = vi.fn<typeof fetch>(async (_u, init) =>
      new Response(String(init?.body), { status: 201 }),
    )
    const filas = Array.from({ length: 1200 }, (_, i) => ({ i }))
    const r = await upsert(s, 'metricas_campania', filas, 'campania_id,fecha', f)
    expect(f).toHaveBeenCalledTimes(3)
    expect(r).toHaveLength(1200)
  })
})

describe('insertar y actualizar', () => {
  it('insertar devuelve la fila creada', async () => {
    const f = responder([{ id: 's1' }], 201)
    expect(await insertar(s, 'sincronizaciones', { tipo: 'campanias' }, f)).toEqual({ id: 's1' })
    expect(llamada(f).headers.get('prefer')).toBe('return=representation')
  })

  it('actualizar hace PATCH filtrando por igualdad', async () => {
    const f = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }))
    await actualizar(s, 'sincronizaciones', { id: 's1' }, { estado: 'ok' }, f)
    const [url, init] = f.mock.calls[0]!
    expect(init?.method).toBe('PATCH')
    expect(new URL(String(url)).searchParams.get('id')).toBe('eq.s1')
  })
})

describe('seleccionar y rpc', () => {
  it('seleccionar pasa los parámetros tal cual a PostgREST', async () => {
    const f = responder([{ estado: 'ok' }])
    await seleccionar(s, 'sincronizaciones', { select: 'estado', order: 'iniciada_en.desc', limit: '1' }, f)
    const c = llamada(f)
    expect(c.metodo).toBe('GET')
    expect(c.url.searchParams.get('order')).toBe('iniciada_en.desc')
  })

  it('rpc hace POST a /rpc/ con los argumentos', async () => {
    const f = responder([{ gasto: 10 }])
    expect(await rpc(s, 'resumen_publicidad', { p_desde: '2026-07-15' }, f)).toEqual([{ gasto: 10 }])
    const c = llamada(f)
    expect(c.url.pathname).toBe('/rest/v1/rpc/resumen_publicidad')
    expect(c.cuerpo).toEqual({ p_desde: '2026-07-15' })
  })
})

describe('errores', () => {
  it('tira ErrorSupabase con status y mensaje, sin la clave', async () => {
    const f = responder({ message: 'relation "x" does not exist', code: '42P01' }, 404)
    const e = await seleccionar(s, 'x', {}, f).catch((x) => x)
    expect(e).toBeInstanceOf(ErrorSupabase)
    expect(e.status).toBe(404)
    expect(e.message).toContain('relation "x" does not exist')
    expect(e.message).not.toContain('sb_secret_xyz')
  })
})
