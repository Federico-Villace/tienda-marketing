import { describe, it, expect, vi } from 'vitest'
import { destinoSeguro, procesarLogin, procesarLogout } from './login'
import { COOKIE_ACCESO, COOKIE_RENOVAR } from './acceso'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'

const entorno = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_123',
  SUPABASE_SECRET_KEY: 'sb_secret_xyz',
}

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })

const formulario = (campos: Record<string, string>) =>
  new Request('https://app.ejemplo.com/api/auth/login', {
    method: 'POST',
    body: new URLSearchParams(campos),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  })

function supabase({ clave = 'buena', miembro = true } = {}) {
  return vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    if (url.pathname === '/auth/v1/token') {
      const { password } = JSON.parse(String(init?.body))
      return password === clave
        ? json({ access_token: 'acc', refresh_token: 'ren', expires_in: 3600, user: { id: 'u-1', email: 'j@x.com' } })
        : json({ error_code: 'invalid_credentials' }, 400)
    }
    if (url.pathname === '/rest/v1/miembros') return json(miembro ? [{ rol: 'director' }] : [])
    throw new Error(`URL inesperada: ${url}`)
  })
}

const destino = (r: Response) => new URL(r.headers.get('location')!)

describe('procesarLogin', () => {
  it('con credenciales buenas y membresía, deja la sesión y vuelve a donde iba', async () => {
    const f = supabase()
    const r = await procesarLogin(formulario({ email: 'j@x.com', password: 'buena', volver: '/tablero' }), entorno, f)

    expect(r.status).toBe(303)
    expect(destino(r).pathname).toBe('/tablero')
    const cookies = r.headers.getSetCookie().join('\n')
    expect(cookies).toContain(`${COOKIE_ACCESO}=acc`)
    expect(cookies).toContain(`${COOKIE_RENOVAR}=ren`)
  })

  it('chequea la membresía en la organización piloto con la clave secreta', async () => {
    const f = supabase()
    await procesarLogin(formulario({ email: 'j@x.com', password: 'buena' }), entorno, f)
    const [u, init] = f.mock.calls.find(([x]) => String(x).includes('/rest/v1/miembros'))!
    const url = new URL(String(u))
    expect(url.searchParams.get('usuario_id')).toBe('eq.u-1')
    expect(url.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
    expect(new Headers(init?.headers).get('apikey')).toBe('sb_secret_xyz')
  })

  it('con clave mala vuelve al login con el error y sin cookies', async () => {
    const r = await procesarLogin(formulario({ email: 'j@x.com', password: 'mala', volver: '/tablero' }), entorno, supabase())
    expect(destino(r).pathname).toBe('/login')
    expect(destino(r).searchParams.get('error')).toBe('credenciales')
    expect(destino(r).searchParams.get('volver')).toBe('/tablero')
    expect(r.headers.getSetCookie()).toEqual([])
  })

  it('un usuario válido que no es miembro no entra', async () => {
    const r = await procesarLogin(formulario({ email: 'j@x.com', password: 'buena' }), entorno, supabase({ miembro: false }))
    expect(destino(r).searchParams.get('error')).toBe('sin_acceso')
    expect(r.headers.getSetCookie()).toEqual([])
  })

  it('con campos vacíos no llama a Supabase', async () => {
    const f = supabase()
    const r = await procesarLogin(formulario({ email: '', password: '' }), entorno, f)
    expect(destino(r).searchParams.get('error')).toBe('credenciales')
    expect(f).not.toHaveBeenCalled()
  })
})

describe('destinoSeguro', () => {
  it.each([
    ['/tablero?marca=1', '/tablero?marca=1'],
    ['https://malo.com', '/'],
    ['//malo.com', '/'],
    ['/\\malo.com', '/'],
    ['/login', '/'],
    [undefined, '/'],
  ])('%s → %s', (entrada, salida) => {
    expect(destinoSeguro(entrada)).toBe(salida)
  })
})

describe('procesarLogout', () => {
  it('borra las cookies y vuelve al login', async () => {
    const f = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }))
    const r = await procesarLogout(
      new Request('https://app.ejemplo.com/api/auth/logout', { method: 'POST', headers: { cookie: `${COOKIE_ACCESO}=acc` } }),
      entorno,
      f,
    )
    expect(r.status).toBe(303)
    expect(destino(r).pathname).toBe('/login')
    expect(r.headers.getSetCookie().join('\n')).toMatch(new RegExp(`${COOKIE_ACCESO}=;.*Max-Age=0`))
  })

  it('revoca la sesión en Supabase, y si falla igual cierra local', async () => {
    const f = vi.fn<typeof fetch>(async () => new Response('caído', { status: 500 }))
    const r = await procesarLogout(
      new Request('https://app.ejemplo.com/api/auth/logout', { method: 'POST', headers: { cookie: `${COOKIE_ACCESO}=acc` } }),
      entorno,
      f,
    )
    expect(String(f.mock.calls[0]![0])).toContain('/auth/v1/logout')
    expect(r.status).toBe(303)
  })
})
