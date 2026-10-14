import { describe, it, expect, vi } from 'vitest'
import {
  buscarUsuarioPorEmail,
  crearUsuario,
  iniciarSesion,
  renovarSesion,
  verificarUsuario,
} from './supabase-auth'

const pub = { url: 'https://abc.supabase.co', key: 'sb_publishable_123' }
const admin = { url: 'https://abc.supabase.co', key: 'sb_secret_xyz' }

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const llamada = (f: ReturnType<typeof vi.fn<typeof fetch>>, n = 0) => {
  const [u, init] = f.mock.calls[n]!
  return {
    url: new URL(String(u)),
    metodo: init?.method ?? 'GET',
    headers: new Headers(init?.headers),
    cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined,
  }
}

const SESION = {
  access_token: 'acceso-1',
  refresh_token: 'renovar-1',
  expires_in: 3600,
  user: { id: 'u-1', email: 'julian@999motos.com.ar' },
}

describe('iniciarSesion', () => {
  it('pide un token por contraseña con la clave publicable', async () => {
    const f = vi.fn<typeof fetch>(async () => json(SESION))
    const s = await iniciarSesion({ ...pub, email: 'julian@999motos.com.ar', password: 'clave' }, f)

    expect(s).toEqual({
      accessToken: 'acceso-1',
      refreshToken: 'renovar-1',
      expiraEn: 3600,
      usuario: { id: 'u-1', email: 'julian@999motos.com.ar' },
    })
    const c = llamada(f)
    expect(c.metodo).toBe('POST')
    expect(c.url.pathname).toBe('/auth/v1/token')
    expect(c.url.searchParams.get('grant_type')).toBe('password')
    expect(c.headers.get('apikey')).toBe('sb_publishable_123')
    expect(c.cuerpo).toEqual({ email: 'julian@999motos.com.ar', password: 'clave' })
  })

  it('credenciales malas devuelven null, no explotan', async () => {
    const f = vi.fn<typeof fetch>(async () => json({ error_code: 'invalid_credentials' }, 400))
    expect(await iniciarSesion({ ...pub, email: 'x@y.z', password: 'mala' }, f)).toBeNull()
  })
})

describe('renovarSesion', () => {
  it('canjea el refresh token por una sesión nueva', async () => {
    const f = vi.fn<typeof fetch>(async () => json(SESION))
    expect((await renovarSesion({ ...pub, refreshToken: 'renovar-0' }, f))?.accessToken).toBe('acceso-1')
    const c = llamada(f)
    expect(c.url.searchParams.get('grant_type')).toBe('refresh_token')
    expect(c.cuerpo).toEqual({ refresh_token: 'renovar-0' })
  })

  it('un refresh vencido o revocado devuelve null', async () => {
    const f = vi.fn<typeof fetch>(async () => json({ error_code: 'refresh_token_not_found' }, 400))
    expect(await renovarSesion({ ...pub, refreshToken: 'viejo' }, f)).toBeNull()
  })
})

describe('verificarUsuario', () => {
  it('le pregunta a Supabase quién es el dueño del token', async () => {
    const f = vi.fn<typeof fetch>(async () => json({ id: 'u-1', email: 'julian@999motos.com.ar' }))
    expect(await verificarUsuario({ ...pub, accessToken: 'acceso-1' }, f)).toEqual({
      id: 'u-1',
      email: 'julian@999motos.com.ar',
    })
    const c = llamada(f)
    expect(c.url.pathname).toBe('/auth/v1/user')
    expect(c.headers.get('authorization')).toBe('Bearer acceso-1')
  })

  it('token vencido o falso devuelve null', async () => {
    const f = vi.fn<typeof fetch>(async () => json({ msg: 'invalid JWT' }, 401))
    expect(await verificarUsuario({ ...pub, accessToken: 'falso' }, f)).toBeNull()
  })
})

describe('administración (clave secreta)', () => {
  it('crearUsuario crea el usuario ya confirmado', async () => {
    const f = vi.fn<typeof fetch>(async () => json({ id: 'u-2', email: 'nuevo@x.com' }))
    expect(await crearUsuario({ ...admin, email: 'nuevo@x.com', password: 'p' }, f)).toEqual({
      id: 'u-2',
      email: 'nuevo@x.com',
    })
    const c = llamada(f)
    expect(c.url.pathname).toBe('/auth/v1/admin/users')
    expect(c.headers.get('apikey')).toBe('sb_secret_xyz')
    expect(c.cuerpo).toEqual({ email: 'nuevo@x.com', password: 'p', email_confirm: true })
  })

  it('crearUsuario devuelve null si el email ya existe', async () => {
    const f = vi.fn<typeof fetch>(async () => json({ error_code: 'email_exists' }, 422))
    expect(await crearUsuario({ ...admin, email: 'ya@x.com', password: 'p' }, f)).toBeNull()
  })

  it('crearUsuario tira el error si es otra cosa', async () => {
    const f = vi.fn<typeof fetch>(async () => json({ msg: 'boom' }, 500))
    await expect(crearUsuario({ ...admin, email: 'a@x.com', password: 'p' }, f)).rejects.toThrow(/500/)
  })

  it('buscarUsuarioPorEmail recorre la lista sin distinguir mayúsculas', async () => {
    const f = vi.fn<typeof fetch>(async () =>
      json({ users: [{ id: 'u-9', email: 'julian@999motos.com.ar' }] }),
    )
    expect(await buscarUsuarioPorEmail({ ...admin, email: 'Julian@999Motos.com.ar' }, f)).toEqual({
      id: 'u-9',
      email: 'julian@999motos.com.ar',
    })
  })
})
