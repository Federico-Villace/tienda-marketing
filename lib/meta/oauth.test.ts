import { describe, it, expect, vi } from 'vitest'
import {
  armarUrlLogin,
  canjearCodigo,
  extenderToken,
  inspeccionarToken,
  verificarAccesoNegocio,
  permisosFaltantes,
  PERMISOS_MVP,
  ErrorMeta,
  describirError,
} from './oauth'

const credenciales = {
  appId: '2324064161428607',
  appSecret: 'secreto-de-la-app',
  version: 'v26.0',
}

const responder = (cuerpo: unknown, status = 200) =>
  vi.fn<typeof fetch>(async () =>
    new Response(JSON.stringify(cuerpo), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )

const urlLlamada = (f: ReturnType<typeof responder>, n = 0) =>
  new URL(String(f.mock.calls[n]?.[0]))

describe('armarUrlLogin', () => {
  const url = new URL(
    armarUrlLogin({
      appId: credenciales.appId,
      version: 'v26.0',
      configId: 'config-123',
      redirectUri: 'https://app.ejemplo.com/api/meta/callback',
      state: 'estado-aleatorio',
    }),
  )

  it('apunta al diálogo de OAuth de la versión pineada', () => {
    expect(url.origin).toBe('https://www.facebook.com')
    expect(url.pathname).toBe('/v26.0/dialog/oauth')
  })

  it('usa la configuración de Login for Business en vez de una lista de scopes', () => {
    expect(url.searchParams.get('config_id')).toBe('config-123')
    expect(url.searchParams.has('scope')).toBe(false)
  })

  it('pide un code y manda el state contra CSRF', () => {
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('state')).toBe('estado-aleatorio')
    expect(url.searchParams.get('client_id')).toBe(credenciales.appId)
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://app.ejemplo.com/api/meta/callback',
    )
  })
})

describe('canjearCodigo', () => {
  it('canjea el code por un token con el mismo redirect_uri del login', async () => {
    const f = responder({ access_token: 'token-nuevo', token_type: 'bearer' })
    const token = await canjearCodigo(
      { ...credenciales, code: 'code-1', redirectUri: 'https://x.com/cb' },
      f,
    )
    expect(token).toBe('token-nuevo')
    const url = urlLlamada(f)
    expect(url.pathname).toBe('/v26.0/oauth/access_token')
    expect(url.searchParams.get('code')).toBe('code-1')
    expect(url.searchParams.get('redirect_uri')).toBe('https://x.com/cb')
    expect(url.searchParams.get('client_secret')).toBe('secreto-de-la-app')
  })

  it('tira ErrorMeta con el mensaje de Meta si el canje falla', async () => {
    const f = responder(
      { error: { message: 'This authorization code has expired.', code: 100 } },
      400,
    )
    await expect(
      canjearCodigo({ ...credenciales, code: 'viejo', redirectUri: 'https://x.com/cb' }, f),
    ).rejects.toMatchObject({
      name: 'ErrorMeta',
      message: 'This authorization code has expired.',
      codigo: 100,
    })
  })
})

describe('extenderToken', () => {
  it('pide el canje fb_exchange_token y devuelve el token largo', async () => {
    const f = responder({ access_token: 'token-largo', expires_in: 5184000 })
    const token = await extenderToken({ ...credenciales, token: 'token-corto' }, f)
    expect(token).toBe('token-largo')
    const url = urlLlamada(f)
    expect(url.searchParams.get('grant_type')).toBe('fb_exchange_token')
    expect(url.searchParams.get('fb_exchange_token')).toBe('token-corto')
  })
})

describe('inspeccionarToken', () => {
  it('devuelve tipo, app, vencimiento y permisos usando el token de app', async () => {
    const f = responder({
      data: {
        type: 'USER',
        app_id: credenciales.appId,
        is_valid: true,
        expires_at: 1767225600,
        scopes: ['ads_read', 'instagram_basic'],
      },
    })
    const info = await inspeccionarToken({ ...credenciales, token: 't' }, f)
    expect(info).toEqual({
      tipo: 'USER',
      appId: credenciales.appId,
      valido: true,
      venceEn: new Date(1767225600 * 1000),
      permisos: ['ads_read', 'instagram_basic'],
    })
    expect(urlLlamada(f).searchParams.get('access_token')).toBe(
      `${credenciales.appId}|secreto-de-la-app`,
    )
  })

  it('suma los permisos de granular_scopes aunque no estén en scopes', async () => {
    const f = responder({
      data: {
        type: 'SYSTEM_USER',
        app_id: '1',
        is_valid: true,
        expires_at: 0,
        scopes: ['instagram_basic'],
        granular_scopes: [
          { scope: 'ads_read', target_ids: ['act_1'] },
          { scope: 'business_management' },
          { scope: 'instagram_basic' },
        ],
      },
    })
    const info = await inspeccionarToken({ ...credenciales, token: 't' }, f)
    expect(info.permisos).toEqual(['instagram_basic', 'ads_read', 'business_management'])
  })

  it('expires_at en 0 significa que no vence', async () => {
    const f = responder({
      data: { type: 'SYSTEM_USER', app_id: '1', is_valid: true, expires_at: 0, scopes: [] },
    })
    const info = await inspeccionarToken({ ...credenciales, token: 't' }, f)
    expect(info.venceEn).toBeNull()
  })
})

describe('ErrorMeta', () => {
  it('conserva código, subcódigo y fbtrace_id del error de Meta', async () => {
    const f = responder(
      {
        error: {
          message: 'Insufficient permission',
          type: 'OAuthException',
          code: 200,
          error_subcode: 1815002,
          fbtrace_id: 'Abc123',
        },
      },
      403,
    )
    const error = await extenderToken({ ...credenciales, token: 't' }, f).catch((e) => e)
    expect(error).toBeInstanceOf(ErrorMeta)
    expect(error).toMatchObject({
      message: 'Insufficient permission',
      codigo: 200,
      subcodigo: 1815002,
      tipo: 'OAuthException',
      fbtraceId: 'Abc123',
    })
  })

  it('describirError arma código/subcódigo + mensaje para mostrar', () => {
    expect(describirError(new ErrorMeta('Sin permiso', { codigo: 200, subcodigo: 99 }))).toBe(
      '(#200/99) Sin permiso',
    )
    expect(describirError(new ErrorMeta('Sin permiso', { codigo: 10 }))).toBe('(#10) Sin permiso')
    expect(describirError(new ErrorMeta('Sin permiso'))).toBe('Sin permiso')
  })
})

describe('verificarAccesoNegocio', () => {
  it('es true si el token puede leer el Business', async () => {
    const f = responder({ id: '155769225183739' })
    const ok = await verificarAccesoNegocio(
      { version: 'v26.0', token: 't', businessId: '155769225183739' },
      f,
    )
    expect(ok).toBe(true)
    expect(urlLlamada(f).pathname).toBe('/v26.0/155769225183739')
  })

  it('es false si Meta niega el acceso', async () => {
    const f = responder({ error: { message: 'Unsupported get request.' } }, 400)
    const ok = await verificarAccesoNegocio(
      { version: 'v26.0', token: 't', businessId: '155769225183739' },
      f,
    )
    expect(ok).toBe(false)
  })
})

describe('permisosFaltantes', () => {
  it('lista los permisos del MVP que el token no trae', () => {
    expect(permisosFaltantes(['instagram_basic', 'ads_read'])).toEqual(
      PERMISOS_MVP.filter((p) => p !== 'instagram_basic' && p !== 'ads_read'),
    )
  })

  it('business_management no es obligatorio: Meta rechazó su App Review (ADR-012)', () => {
    const sinBusiness = [
      'instagram_basic',
      'instagram_manage_insights',
      'pages_read_engagement',
      'ads_read',
    ]
    expect(permisosFaltantes(sinBusiness)).toEqual([])
  })

  it('no falta nada si están todos', () => {
    expect(permisosFaltantes([...PERMISOS_MVP])).toEqual([])
  })
})
