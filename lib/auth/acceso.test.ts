import { describe, it, expect, vi } from 'vitest'
import { controlarAcceso, COOKIE_ACCESO, COOKIE_RENOVAR, encabezadosHaciaAdentro, HEADER_USUARIO } from './acceso'

const entorno = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_123',
}

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })

const pedido = (ruta: string, cookies: Record<string, string> = {}) =>
  new Request(`https://app.ejemplo.com${ruta}`, {
    headers: {
      cookie: Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; '),
    },
  })

/** Supabase Auth falso: un token válido y un refresh válido. */
const auth = () =>
  vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    if (url.pathname === '/auth/v1/user') {
      return new Headers(init?.headers).get('authorization') === 'Bearer bueno'
        ? json({ id: 'u-1', email: 'j@x.com' })
        : json({ msg: 'invalid JWT' }, 401)
    }
    if (url.pathname === '/auth/v1/token') {
      const { refresh_token } = JSON.parse(String(init?.body))
      return refresh_token === 'renovar-bueno'
        ? json({ access_token: 'nuevo', refresh_token: 'renovar-nuevo', expires_in: 3600, user: { id: 'u-1', email: 'j@x.com' } })
        : json({ error_code: 'refresh_token_not_found' }, 400)
    }
    throw new Error(`URL inesperada: ${url}`)
  })

describe('controlarAcceso', () => {
  it.each(['/login', '/api/auth/login', '/api/sync', '/api/sync-organico'])('%s es pública', async (ruta) => {
    const f = auth()
    expect(await controlarAcceso(pedido(ruta), entorno, f)).toEqual({ tipo: 'pasar' })
    expect(f).not.toHaveBeenCalled()
  })

  it('sin sesión, una página redirige al login recordando a dónde iba', async () => {
    const r = await controlarAcceso(pedido('/tablero?marca=1'), entorno, auth())
    expect(r.tipo).toBe('responder')
    if (r.tipo !== 'responder') return
    expect(r.respuesta.status).toBe(307)
    const destino = new URL(r.respuesta.headers.get('location')!)
    expect(destino.pathname).toBe('/login')
    expect(destino.searchParams.get('volver')).toBe('/tablero?marca=1')
  })

  it('/api/actualizar NO es pública: sin sesión responde 401', async () => {
    const f = auth()
    const r = await controlarAcceso(pedido('/api/actualizar'), entorno, f)
    expect(r.tipo === 'responder' && r.respuesta.status).toBe(401)
  })

  it('sin sesión, una API responde 401 en vez de redirigir', async () => {
    const r = await controlarAcceso(pedido('/api/meta/login'), entorno, auth())
    expect(r.tipo === 'responder' && r.respuesta.status).toBe(401)
  })

  it('con un access token válido, pasa', async () => {
    expect(await controlarAcceso(pedido('/tablero', { [COOKIE_ACCESO]: 'bueno' }), entorno, auth())).toEqual({
      tipo: 'pasar',
      usuarioId: 'u-1',
    })
  })

  it('con el access vencido pero el refresh válido, renueva y pasa con cookies nuevas', async () => {
    const r = await controlarAcceso(
      pedido('/tablero', { [COOKIE_ACCESO]: 'vencido', [COOKIE_RENOVAR]: 'renovar-bueno' }),
      entorno,
      auth(),
    )
    expect(r.tipo).toBe('pasar')
    if (r.tipo !== 'pasar') return
    expect(r.setCookies?.join('\n')).toContain(`${COOKIE_ACCESO}=nuevo`)
    expect(r.setCookies?.join('\n')).toContain(`${COOKIE_RENOVAR}=renovar-nuevo`)
    // El usuario verificado viaja igual: el endpoint no vuelve a tocar la cookie vieja.
    expect(r.usuarioId).toBe('u-1')
  })

  it('con todo vencido, manda al login y borra las cookies', async () => {
    const r = await controlarAcceso(
      pedido('/tablero', { [COOKIE_ACCESO]: 'vencido', [COOKIE_RENOVAR]: 'viejo' }),
      entorno,
      auth(),
    )
    expect(r.tipo === 'responder' && r.respuesta.status).toBe(307)
    if (r.tipo !== 'responder') return
    expect(r.respuesta.headers.get('set-cookie')).toMatch(new RegExp(`${COOKIE_ACCESO}=;.*Max-Age=0`))
  })

  it('las cookies de sesión son httpOnly, Secure en https y SameSite=Lax', async () => {
    const r = await controlarAcceso(
      pedido('/tablero', { [COOKIE_RENOVAR]: 'renovar-bueno' }),
      entorno,
      auth(),
    )
    const cookie = r.tipo === 'pasar' ? r.setCookies![0]! : ''
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/Secure/)
    expect(cookie).toMatch(/SameSite=Lax/)
    expect(cookie).toMatch(/Path=\//)
  })

  it('sin configuración de Supabase, cierra todo (falla cerrado)', async () => {
    const r = await controlarAcceso(pedido('/tablero'), {}, auth())
    expect(r.tipo === 'responder' && r.respuesta.status).toBe(503)
  })

  it('si Supabase Auth se cae, cierra todo en vez de dejar pasar', async () => {
    const f = vi.fn<typeof fetch>(async () => new Response('caído', { status: 502 }))
    const r = await controlarAcceso(pedido('/tablero', { [COOKIE_ACCESO]: 'bueno' }), entorno, f)
    expect(r.tipo === 'responder' && r.respuesta.status).toBe(503)
  })
})

describe('encabezadosHaciaAdentro', () => {
  const conSpoof = (extra: Record<string, string> = {}) =>
    new Request('https://app.ejemplo.com/api/analisis', {
      headers: { [HEADER_USUARIO]: 'admin-falso', 'x-otro': 'queda', ...extra },
    })

  it('el header se llama x-usuario-id', () => {
    expect(HEADER_USUARIO).toBe('x-usuario-id')
  })

  it('SEGURIDAD: borra el x-usuario-id que mande el cliente y pone el verificado', () => {
    const h = encabezadosHaciaAdentro(conSpoof(), 'u-1')
    expect(h.get(HEADER_USUARIO)).toBe('u-1')
    expect([...h.entries()].filter(([k]) => k === HEADER_USUARIO)).toHaveLength(1)
  })

  it('SEGURIDAD: sin usuario verificado (ruta pública) el header spoofeado igual se borra', () => {
    expect(encabezadosHaciaAdentro(conSpoof(), undefined).has(HEADER_USUARIO)).toBe(false)
  })

  it('SEGURIDAD: el borrado no distingue mayúsculas', () => {
    const r = new Request('https://app.ejemplo.com/', { headers: { 'X-Usuario-Id': 'falso' } })
    expect(encabezadosHaciaAdentro(r, undefined).has(HEADER_USUARIO)).toBe(false)
  })

  it('conserva el resto de los headers y no muta los del request original', () => {
    const r = conSpoof()
    const h = encabezadosHaciaAdentro(r, 'u-1')
    expect(h.get('x-otro')).toBe('queda')
    expect(r.headers.get(HEADER_USUARIO)).toBe('admin-falso')
  })
})
