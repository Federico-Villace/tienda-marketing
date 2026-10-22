import { describe, it, expect, vi } from 'vitest'
import { ErrorSupabase } from './rest'
import { borrarObjetos, descargarObjeto, firmarUrls, subirObjeto } from './storage'

const s = { url: 'https://x.supabase.co', secretKey: 'sb_secret_abc' }

describe('subirObjeto', () => {
  it('POST a storage/v1/object/{bucket}/{ruta} con apikey, bearer, mime y sin upsert', async () => {
    const f = vi.fn(async () => new Response('{"Key":"creativos/o/g/1.jpg"}', { status: 200 }))
    await subirObjeto(s, 'creativos', 'org/gen/1.jpg', new Uint8Array([1, 2, 3]), 'image/jpeg', f as unknown as typeof fetch)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(String(url)).toBe('https://x.supabase.co/storage/v1/object/creativos/org/gen/1.jpg')
    expect(init.method).toBe('POST')
    const h = init.headers as Record<string, string>
    expect(h.apikey).toBe('sb_secret_abc')
    expect(h.authorization).toBe('Bearer sb_secret_abc')
    expect(h['content-type']).toBe('image/jpeg')
    expect(h['x-upsert']).toBe('false')
    expect(init.body).toBeInstanceOf(Uint8Array)
  })

  it('un fallo tira ErrorSupabase sin la clave', async () => {
    const f = async () => new Response('{"message":"Duplicate"}', { status: 409 })
    const e = await subirObjeto(s, 'creativos', 'a.jpg', new Uint8Array([1]), 'image/jpeg', f as unknown as typeof fetch).catch((x) => x)
    expect(e).toBeInstanceOf(ErrorSupabase)
    expect(e.status).toBe(409)
    expect(e.message).not.toContain('sb_secret_abc')
  })
})

describe('firmarUrls', () => {
  it('firma en lote y arma la URL completa', async () => {
    const f = vi.fn(async () =>
      Response.json([
        { path: 'o/g/1.jpg', signedURL: '/object/sign/creativos/o/g/1.jpg?token=T', error: null },
        { path: 'o/g/2.jpg', signedURL: null, error: 'Object not found' },
      ]),
    )
    const r = await firmarUrls(s, 'creativos', ['o/g/1.jpg', 'o/g/2.jpg'], 3600, f as unknown as typeof fetch)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(String(url)).toBe('https://x.supabase.co/storage/v1/object/sign/creativos')
    expect(JSON.parse(String(init.body))).toEqual({ expiresIn: 3600, paths: ['o/g/1.jpg', 'o/g/2.jpg'] })
    expect(r.get('o/g/1.jpg')).toBe('https://x.supabase.co/storage/v1/object/sign/creativos/o/g/1.jpg?token=T')
    expect(r.has('o/g/2.jpg')).toBe(false)
  })

  it('sin rutas no hace ninguna request', async () => {
    const f = vi.fn()
    const r = await firmarUrls(s, 'creativos', [], 3600, f as unknown as typeof fetch)
    expect(r.size).toBe(0)
    expect(f).not.toHaveBeenCalled()
  })
})

describe('descargarObjeto (F10)', () => {
  it('S10.1 GET a object/authenticated con apikey y bearer, y devuelve los bytes', async () => {
    const f = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    const b = await descargarObjeto(s, 'fotos', 'org/id.jpg', f as unknown as typeof fetch)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(String(url)).toBe('https://x.supabase.co/storage/v1/object/authenticated/fotos/org/id.jpg')
    expect(init.method ?? 'GET').toBe('GET')
    const h = init.headers as Record<string, string>
    expect(h.apikey).toBe('sb_secret_abc')
    expect(h.authorization).toBe('Bearer sb_secret_abc')
    expect(b).toBeInstanceOf(Uint8Array)
    expect(Array.from(b)).toEqual([1, 2, 3])
  })

  it('S10.2 un no-ok tira ErrorSupabase con el status y sin la clave', async () => {
    const f = async () => new Response(`{"message":"not found ${s.secretKey}"}`, { status: 404 })
    const e = await descargarObjeto(s, 'fotos', 'a.jpg', f as unknown as typeof fetch).catch((x) => x)
    expect(e).toBeInstanceOf(ErrorSupabase)
    expect(e.status).toBe(404)
    expect(e.message).not.toContain(s.secretKey)
  })
})

describe('borrarObjetos (F10)', () => {
  it('S10.3 DELETE a object/{bucket} con {prefixes}', async () => {
    const f = vi.fn(async () => new Response('[]', { status: 200 }))
    await borrarObjetos(s, 'fotos', ['org/a.jpg', 'org/b.jpg'], f as unknown as typeof fetch)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(String(url)).toBe('https://x.supabase.co/storage/v1/object/fotos')
    expect(init.method).toBe('DELETE')
    const h = init.headers as Record<string, string>
    expect(h.apikey).toBe('sb_secret_abc')
    expect(h['content-type']).toBe('application/json')
    expect(JSON.parse(String(init.body))).toEqual({ prefixes: ['org/a.jpg', 'org/b.jpg'] })
  })

  it('sin rutas no hace ninguna request', async () => {
    const f = vi.fn()
    await borrarObjetos(s, 'fotos', [], f as unknown as typeof fetch)
    expect(f).not.toHaveBeenCalled()
  })

  it('S10.4 un fallo tira ErrorSupabase sin la clave', async () => {
    const f = async () => new Response(`{"message":"${s.secretKey}"}`, { status: 500 })
    const e = await borrarObjetos(s, 'fotos', ['a'], f as unknown as typeof fetch).catch((x) => x)
    expect(e).toBeInstanceOf(ErrorSupabase)
    expect(e.message).not.toContain(s.secretKey)
  })
})

describe('secretos', () => {
  it('si Storage repite la clave secreta en el error, se enmascara', async () => {
    const f = async () => new Response(`{"message":"mala clave ${s.secretKey}"}`, { status: 401 })
    const e = await firmarUrls(s, 'creativos', ['a'], 60, f as unknown as typeof fetch).catch((x) => x)
    expect(e.message).not.toContain(s.secretKey)
    const e2 = await subirObjeto(s, 'creativos', 'a', new Uint8Array([1]), 'image/jpeg', f as unknown as typeof fetch).catch((x) => x)
    expect(e2.message).not.toContain(s.secretKey)
  })
})
