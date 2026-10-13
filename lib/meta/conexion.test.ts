import { describe, it, expect, vi } from 'vitest'
import {
  iniciarLogin,
  procesarCallback,
  leerResultadoConexion,
  COOKIE_STATE,
} from './conexion'

const entorno = {
  META_APP_ID: '2324064161428607',
  META_APP_SECRET: 'secreto-de-la-app',
  META_API_VERSION: 'v26.0',
  META_CONFIG_ID: 'config-123',
  META_BUSINESS_ID: '155769225183739',
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_xyz',
}

const ORIGEN = 'https://app.ejemplo.com'
const CALLBACK = `${ORIGEN}/api/meta/callback`

const destino = (r: Response) => new URL(r.headers.get('location')!)

describe('iniciarLogin', () => {
  it('redirige al diálogo de Meta con el callback de este mismo origen', () => {
    const r = iniciarLogin(new Request(`${ORIGEN}/api/meta/login`), entorno, () => 'st-1')
    const url = destino(r)
    expect(url.origin).toBe('https://www.facebook.com')
    expect(url.searchParams.get('redirect_uri')).toBe(CALLBACK)
    expect(url.searchParams.get('state')).toBe('st-1')
  })

  it('guarda el state en una cookie httpOnly de vida corta', () => {
    const r = iniciarLogin(new Request(`${ORIGEN}/api/meta/login`), entorno, () => 'st-1')
    const cookie = r.headers.get('set-cookie')!
    expect(cookie).toContain(`${COOKIE_STATE}=st-1`)
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
    expect(cookie).toMatch(/Max-Age=600/)
  })

  it('vuelve a configuración si falta META_CONFIG_ID', () => {
    const { META_CONFIG_ID: _, ...sinConfig } = entorno
    const r = iniciarLogin(new Request(`${ORIGEN}/api/meta/login`), sinConfig, () => 's')
    const url = destino(r)
    expect(url.pathname).toBe('/configuracion')
    expect(url.searchParams.get('meta')).toBe('error')
    expect(url.searchParams.get('motivo')).toBe('falta_config')
  })
})

/** Simula la Graph API y el RPC de Supabase según la URL pedida. */
function falsaMeta(
  opciones: {
    tipo?: string
    expiresAt?: number
    accesoNegocio?: boolean
    valido?: boolean
    appId?: string
    scopes?: string[]
  } = {},
) {
  const {
    tipo = 'SYSTEM_USER',
    expiresAt = 0,
    accesoNegocio = true,
    valido = true,
    appId = entorno.META_APP_ID,
    scopes = ['instagram_basic', 'instagram_manage_insights', 'pages_read_engagement', 'ads_read'],
  } = opciones
  const json = (cuerpo: unknown, status = 200) =>
    new Response(JSON.stringify(cuerpo), { status })

  return vi.fn<typeof fetch>(async (entrada) => {
    const url = new URL(String(entrada))
    if (url.hostname === 'abc.supabase.co') return new Response(null, { status: 204 })
    if (url.pathname.endsWith('/oauth/access_token')) {
      const largo = url.searchParams.get('grant_type') === 'fb_exchange_token'
      return json({ access_token: largo ? 'token-largo' : 'token-del-code' })
    }
    if (url.pathname.endsWith('/debug_token')) {
      return json({
        data: {
          type: tipo,
          app_id: appId,
          is_valid: valido,
          expires_at: expiresAt,
          scopes,
        },
      })
    }
    if (url.pathname.endsWith(`/${entorno.META_BUSINESS_ID}`)) {
      return accesoNegocio ? json({ id: entorno.META_BUSINESS_ID }) : json({ error: { message: 'no' } }, 400)
    }
    throw new Error(`URL inesperada en el test: ${url}`)
  })
}

const callback = (params: string, state = 'st-1') =>
  new Request(`${CALLBACK}?${params}`, {
    headers: { cookie: `${COOKIE_STATE}=${state}` },
  })

const tokenGuardado = (f: ReturnType<typeof falsaMeta>) => {
  const llamada = f.mock.calls.find(([u]) => String(u).includes('/rpc/guardar_token_meta'))
  return llamada ? JSON.parse(String(llamada[1]?.body)).p_token : undefined
}

describe('procesarCallback', () => {
  it('canjea el code, guarda el token en Vault y vuelve con el resumen', async () => {
    const f = falsaMeta()
    const r = await procesarCallback(callback('code=c-1&state=st-1'), entorno, f)
    const url = destino(r)

    expect(tokenGuardado(f)).toBe('token-del-code')
    expect(url.pathname).toBe('/configuracion')
    expect(url.searchParams.get('meta')).toBe('ok')
    expect(url.searchParams.get('tipo')).toBe('SYSTEM_USER')
    expect(url.searchParams.get('vence')).toBe('nunca')
    expect(url.searchParams.get('faltan')).toBe('')
  })

  it('no pisa el token de Vault con uno al que le faltan permisos del MVP', async () => {
    const f = falsaMeta({ scopes: ['instagram_basic', 'pages_read_engagement'] })
    const r = await procesarCallback(callback('code=c-1&state=st-1'), entorno, f)
    const url = destino(r)
    expect(url.searchParams.get('meta')).toBe('error')
    expect(url.searchParams.get('motivo')).toBe('permisos_insuficientes')
    expect(url.searchParams.get('detalle')).toBe('instagram_manage_insights,ads_read')
    expect(tokenGuardado(f)).toBeUndefined()
  })

  it('nunca pone el token en la URL de vuelta', async () => {
    const r = await procesarCallback(callback('code=c-1&state=st-1'), entorno, falsaMeta())
    expect(r.headers.get('location')).not.toContain('token-del-code')
  })

  it('canjea el canje con el mismo redirect_uri del login', async () => {
    const f = falsaMeta()
    await procesarCallback(callback('code=c-1&state=st-1'), entorno, f)
    const canje = new URL(String(f.mock.calls[0]![0]))
    expect(canje.searchParams.get('redirect_uri')).toBe(CALLBACK)
  })

  it('si el token es de usuario y vence, lo extiende a largo antes de guardarlo', async () => {
    const f = falsaMeta({ tipo: 'USER', expiresAt: 1767225600 })
    const r = await procesarCallback(callback('code=c-1&state=st-1'), entorno, f)
    expect(tokenGuardado(f)).toBe('token-largo')
    expect(destino(r).searchParams.get('vence')).toBe(new Date(1767225600 * 1000).toISOString())
  })

  it('rechaza si el state no coincide con la cookie (CSRF)', async () => {
    const f = falsaMeta()
    const r = await procesarCallback(callback('code=c-1&state=otro'), entorno, f)
    expect(destino(r).searchParams.get('motivo')).toBe('state_invalido')
    expect(f).not.toHaveBeenCalled()
  })

  it('rechaza si no hay cookie de state', async () => {
    const f = falsaMeta()
    const r = await procesarCallback(
      new Request(`${CALLBACK}?code=c-1&state=st-1`),
      entorno,
      f,
    )
    expect(destino(r).searchParams.get('motivo')).toBe('state_invalido')
  })

  it('informa cancelado si la persona rechazó el diálogo', async () => {
    const f = falsaMeta()
    const r = await procesarCallback(
      callback('error=access_denied&error_reason=user_denied&state=st-1'),
      entorno,
      f,
    )
    expect(destino(r).searchParams.get('motivo')).toBe('cancelado')
    expect(f).not.toHaveBeenCalled()
  })

  it('no guarda el token si no ve el Business del cliente', async () => {
    const f = falsaMeta({ accesoNegocio: false })
    const r = await procesarCallback(callback('code=c-1&state=st-1'), entorno, f)
    expect(destino(r).searchParams.get('motivo')).toBe('sin_acceso_negocio')
    expect(tokenGuardado(f)).toBeUndefined()
  })

  it('no guarda un token que Meta marca como inválido', async () => {
    const f = falsaMeta({ valido: false })
    const r = await procesarCallback(callback('code=c-1&state=st-1'), entorno, f)
    expect(destino(r).searchParams.get('motivo')).toBe('token_invalido')
    expect(tokenGuardado(f)).toBeUndefined()
  })

  it('no guarda un token emitido para otra app', async () => {
    const f = falsaMeta({ appId: '999' })
    const r = await procesarCallback(callback('code=c-1&state=st-1'), entorno, f)
    expect(destino(r).searchParams.get('motivo')).toBe('token_invalido')
    expect(tokenGuardado(f)).toBeUndefined()
  })

  it('el detalle del error trae el código y subcódigo de Meta', async () => {
    const f = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({ error: { message: 'Code expired', code: 100, error_subcode: 36007 } }),
          { status: 400 },
        ),
    )
    const r = await procesarCallback(callback('code=c-1&state=st-1'), entorno, f)
    expect(destino(r).searchParams.get('detalle')).toBe('(#100/36007) Code expired')
  })

  it('muestra el mensaje de Meta si el canje falla', async () => {
    const f = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ error: { message: 'Code expired' } }), { status: 400 }),
    )
    const r = await procesarCallback(callback('code=c-1&state=st-1'), entorno, f)
    const url = destino(r)
    expect(url.searchParams.get('motivo')).toBe('meta')
    expect(url.searchParams.get('detalle')).toBe('Code expired')
  })

  it('borra la cookie de state al terminar', async () => {
    const r = await procesarCallback(callback('code=c-1&state=st-1'), entorno, falsaMeta())
    expect(r.headers.get('set-cookie')).toMatch(new RegExp(`${COOKIE_STATE}=;.*Max-Age=0`, 'i'))
  })
})

describe('leerResultadoConexion', () => {
  it('no hay resultado si no vino de un login', () => {
    expect(leerResultadoConexion({})).toBeNull()
  })

  it('lee un ok con sus faltantes', () => {
    expect(
      leerResultadoConexion({ meta: 'ok', tipo: 'USER', vence: 'nunca', faltan: 'ads_read,read_insights' }),
    ).toEqual({ ok: true, tipo: 'USER', vence: 'nunca', faltan: ['ads_read', 'read_insights'] })
  })

  it('lee un error con un mensaje para humanos', () => {
    const r = leerResultadoConexion({ meta: 'error', motivo: 'sin_acceso_negocio' })
    expect(r).toMatchObject({ ok: false })
    expect(r && !r.ok && r.mensaje.length).toBeGreaterThan(0)
  })
})
