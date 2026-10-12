import { describe, it, expect, vi } from 'vitest'
import { guardarTokenMeta, leerTokenMeta, NOMBRE_SECRETO_META } from './boveda'

const supabase = { url: 'https://abc.supabase.co', secretKey: 'sb_secret_xyz' }

describe('guardarTokenMeta', () => {
  it('llama al RPC guardar_token_meta con la clave secreta, solo del servidor', async () => {
    const f = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }))
    await guardarTokenMeta({ ...supabase, token: 'token-meta' }, f)

    const [url, init] = f.mock.calls[0]!
    expect(String(url)).toBe('https://abc.supabase.co/rest/v1/rpc/guardar_token_meta')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('apikey')).toBe('sb_secret_xyz')
    expect(JSON.parse(String(init?.body))).toEqual({
      p_nombre: NOMBRE_SECRETO_META,
      p_token: 'token-meta',
    })
  })

  it('tira un error claro sin filtrar el token si Supabase falla', async () => {
    const f = vi.fn<typeof fetch>(
      async () => new Response('{"message":"function not found"}', { status: 404 }),
    )
    const promesa = guardarTokenMeta({ ...supabase, token: 'token-que-no-sale' }, f)
    await expect(promesa).rejects.toThrow(/404/)
    await expect(promesa).rejects.not.toThrow(/token-que-no-sale/)
  })
})

describe('leerTokenMeta', () => {
  it('lee el secreto por el RPC leer_token_meta con la clave secreta', async () => {
    const f = vi.fn<typeof fetch>(async () => new Response(JSON.stringify('token-meta'), { status: 200 }))
    expect(await leerTokenMeta(supabase, f)).toBe('token-meta')

    const [url, init] = f.mock.calls[0]!
    expect(String(url)).toBe('https://abc.supabase.co/rest/v1/rpc/leer_token_meta')
    expect(new Headers(init?.headers).get('apikey')).toBe('sb_secret_xyz')
    expect(JSON.parse(String(init?.body))).toEqual({ p_nombre: NOMBRE_SECRETO_META })
  })

  it('devuelve null si todavía no se conectó nadie', async () => {
    const f = vi.fn<typeof fetch>(async () => new Response('null', { status: 200 }))
    expect(await leerTokenMeta(supabase, f)).toBeNull()
  })

  it('tira un error con el status si Supabase falla', async () => {
    const f = vi.fn<typeof fetch>(async () => new Response('{}', { status: 401 }))
    await expect(leerTokenMeta(supabase, f)).rejects.toThrow(/401/)
  })
})
