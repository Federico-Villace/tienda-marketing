/**
 * Conexión con Meta por Facebook Login for Business (ADR-011).
 *
 *   /api/meta/login     → arma el state, redirige al diálogo de Meta
 *   /api/meta/callback  → valida el state, canjea el code, guarda en Vault
 *
 * Son funciones Request → Response con todo inyectado: las rutas de Next solo
 * les pasan `process.env` y `fetch`. El token nunca sale del servidor ni viaja
 * en una URL; a la pantalla vuelve solo el resumen (tipo, vencimiento, faltantes).
 */

import {
  armarUrlLogin,
  canjearCodigo,
  describirError,
  ErrorMeta,
  extenderToken,
  inspeccionarToken,
  permisosFaltantes,
  verificarAccesoNegocio,
} from './oauth'
import { guardarTokenMeta } from './boveda'

type Entorno = Record<string, string | undefined>

export const COOKIE_STATE = 'meta_oauth_state'
const RUTA_COOKIE = '/api/meta'
const VERSION_POR_DEFECTO = 'v26.0'

export type Motivo =
  | 'falta_config'
  | 'state_invalido'
  | 'cancelado'
  | 'sin_acceso_negocio'
  | 'token_invalido'
  | 'meta'
  | 'guardado'

const MENSAJES: Record<Motivo, string> = {
  falta_config:
    'Faltan variables para iniciar el login: META_APP_ID, META_APP_SECRET, META_CONFIG_ID, META_BUSINESS_ID o las de Supabase.',
  state_invalido:
    'El login no se pudo validar (state distinto o vencido). Volvé a intentarlo desde este botón.',
  cancelado: 'Se canceló el login de Facebook. No se guardó nada.',
  sin_acceso_negocio:
    'La cuenta con la que te logueaste no tiene acceso al Business de 999 Motos. No se guardó el token.',
  token_invalido:
    'Meta devolvió un token inválido o emitido para otra app. No se guardó nada.',
  meta: 'Meta rechazó el pedido.',
  guardado: 'El token se obtuvo pero no se pudo guardar en Supabase Vault. ¿Está aplicada la migración?',
}

const callbackDe = (request: Request) =>
  new URL('/api/meta/callback', request.url).toString()

function cookie(request: Request, valor: string, maxAge: number): string {
  const segura = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return `${COOKIE_STATE}=${valor}; Path=${RUTA_COOKIE}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${segura}`
}

function leerCookie(request: Request, nombre: string): string | undefined {
  const encabezado = request.headers.get('cookie') ?? ''
  for (const parte of encabezado.split(';')) {
    const [clave, ...resto] = parte.trim().split('=')
    if (clave === nombre) return resto.join('=')
  }
  return undefined
}

function redirigir(destino: string, setCookie?: string): Response {
  const headers = new Headers({ location: destino })
  if (setCookie) headers.set('set-cookie', setCookie)
  return new Response(null, { status: 307, headers })
}

function volverAConfiguracion(
  request: Request,
  params: Record<string, string>,
): Response {
  const url = new URL('/configuracion', request.url)
  for (const [clave, valor] of Object.entries(params)) url.searchParams.set(clave, valor)
  return redirigir(url.toString(), cookie(request, '', 0))
}

const error = (request: Request, motivo: Motivo, detalle?: string) =>
  volverAConfiguracion(request, {
    meta: 'error',
    motivo,
    ...(detalle ? { detalle } : {}),
  })

const REQUERIDAS = [
  'META_APP_ID',
  'META_APP_SECRET',
  'META_CONFIG_ID',
  'META_BUSINESS_ID',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
] as const

type Config = Record<(typeof REQUERIDAS)[number], string> & { version: string }

function leerConfig(entorno: Entorno): Config | null {
  if (REQUERIDAS.some((n) => !entorno[n]?.trim())) return null
  const config = Object.fromEntries(REQUERIDAS.map((n) => [n, entorno[n]!.trim()]))
  return {
    ...(config as Record<(typeof REQUERIDAS)[number], string>),
    version: entorno.META_API_VERSION?.trim() || VERSION_POR_DEFECTO,
  }
}

export function iniciarLogin(
  request: Request,
  entorno: Entorno,
  generarState: () => string,
): Response {
  const config = leerConfig(entorno)
  if (!config) return error(request, 'falta_config')

  const state = generarState()
  const url = armarUrlLogin({
    appId: config.META_APP_ID,
    version: config.version,
    configId: config.META_CONFIG_ID,
    redirectUri: callbackDe(request),
    state,
  })
  return redirigir(url, cookie(request, state, 600))
}

export async function procesarCallback(
  request: Request,
  entorno: Entorno,
  f: typeof fetch,
): Promise<Response> {
  const config = leerConfig(entorno)
  if (!config) return error(request, 'falta_config')

  const params = new URL(request.url).searchParams
  const state = params.get('state')
  if (!state || state !== leerCookie(request, COOKIE_STATE)) {
    return error(request, 'state_invalido')
  }
  if (params.has('error')) return error(request, 'cancelado')

  const code = params.get('code')
  if (!code) return error(request, 'cancelado')

  const credenciales = {
    appId: config.META_APP_ID,
    appSecret: config.META_APP_SECRET,
    version: config.version,
  }

  try {
    let token = await canjearCodigo(
      { ...credenciales, code, redirectUri: callbackDe(request) },
      f,
    )
    let info = await inspeccionarToken({ ...credenciales, token }, f)

    if (info.tipo === 'USER' && info.venceEn !== null) {
      token = await extenderToken({ ...credenciales, token }, f)
      info = await inspeccionarToken({ ...credenciales, token }, f)
    }

    if (!info.valido || info.appId !== config.META_APP_ID) {
      return error(request, 'token_invalido')
    }

    const veNegocio = await verificarAccesoNegocio(
      { version: config.version, token, businessId: config.META_BUSINESS_ID },
      f,
    )
    if (!veNegocio) return error(request, 'sin_acceso_negocio')

    try {
      await guardarTokenMeta(
        { url: config.NEXT_PUBLIC_SUPABASE_URL, secretKey: config.SUPABASE_SECRET_KEY, token },
        f,
      )
    } catch {
      return error(request, 'guardado')
    }

    return volverAConfiguracion(request, {
      meta: 'ok',
      tipo: info.tipo,
      vence: info.venceEn ? info.venceEn.toISOString() : 'nunca',
      faltan: permisosFaltantes(info.permisos).join(','),
    })
  } catch (e) {
    if (e instanceof ErrorMeta) return error(request, 'meta', describirError(e))
    throw e
  }
}

export type ResultadoConexion =
  | { ok: true; tipo: string; vence: string; faltan: string[] }
  | { ok: false; mensaje: string; detalle?: string }

/** Traduce los query params de vuelta del callback a algo que la pantalla muestra. */
export function leerResultadoConexion(
  params: Record<string, string | string[] | undefined>,
): ResultadoConexion | null {
  const uno = (clave: string) => {
    const v = params[clave]
    return Array.isArray(v) ? v[0] : v
  }

  if (uno('meta') === 'ok') {
    return {
      ok: true,
      tipo: uno('tipo') ?? '?',
      vence: uno('vence') ?? '?',
      faltan: (uno('faltan') ?? '').split(',').filter(Boolean),
    }
  }
  if (uno('meta') === 'error') {
    const motivo = uno('motivo') as Motivo | undefined
    const detalle = uno('detalle')
    return {
      ok: false,
      mensaje: (motivo && MENSAJES[motivo]) || 'Algo salió mal en la conexión con Meta.',
      ...(detalle ? { detalle } : {}),
    }
  }
  return null
}
