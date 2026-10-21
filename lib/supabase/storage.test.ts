import { describe, it, expect, vi } from 'vitest'
import { ErrorSupabase } from './rest'
import { firmarUrls, subirObjeto } from './storage'

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
