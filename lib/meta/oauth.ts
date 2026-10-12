/**
 * OAuth de Meta con Facebook Login for Business.
 *
 * Los permisos NO se piden acá: los fija la configuración (`config_id`) creada
 * en developers.facebook.com. Quien se loguea solo elige a qué cuentas da acceso.
 *
 * Todas las funciones reciben `fetch` inyectado para poder testearlas sin red.
 */

type Fetch = typeof fetch

/** Permisos sin los cuales la ingesta del MVP no puede leer métricas ni ads. */
export const PERMISOS_MVP = [
  'instagram_basic',
  'instagram_manage_insights',
  'pages_read_engagement',
  'ads_read',
  'business_management',
] as const

export class ErrorMeta extends Error {
  override name = 'ErrorMeta'
}

type Credenciales = {
  readonly appId: string
  readonly appSecret: string
  readonly version: string
}

const graph = (version: string, ruta: string, params: Record<string, string>) => {
  const url = new URL(`https://graph.facebook.com/${version}/${ruta}`)
  for (const [clave, valor] of Object.entries(params)) url.searchParams.set(clave, valor)
  return url
}

/** GET a la Graph API. Si Meta responde con error, tira ErrorMeta con su mensaje. */
async function pedir<T>(url: URL, f: Fetch): Promise<T> {
  const respuesta = await f(url)
  const cuerpo = (await respuesta.json()) as T & { error?: { message?: string } }
  if (!respuesta.ok || cuerpo.error) {
    throw new ErrorMeta(cuerpo.error?.message ?? `Meta respondió ${respuesta.status}`)
  }
  return cuerpo
}

export function armarUrlLogin(p: {
  appId: string
  version: string
  configId: string
  redirectUri: string
  state: string
}): string {
  const url = new URL(`https://www.facebook.com/${p.version}/dialog/oauth`)
  url.searchParams.set('client_id', p.appId)
  url.searchParams.set('config_id', p.configId)
  url.searchParams.set('redirect_uri', p.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', p.state)
  return url.toString()
}

export async function canjearCodigo(
  p: Credenciales & { code: string; redirectUri: string },
  f: Fetch,
): Promise<string> {
  const cuerpo = await pedir<{ access_token: string }>(
    graph(p.version, 'oauth/access_token', {
      client_id: p.appId,
      client_secret: p.appSecret,
      redirect_uri: p.redirectUri,
      code: p.code,
    }),
    f,
  )
  return cuerpo.access_token
}

/** Token de usuario corto → largo (~60 días). Los de system user no lo necesitan. */
export async function extenderToken(
  p: Credenciales & { token: string },
  f: Fetch,
): Promise<string> {
  const cuerpo = await pedir<{ access_token: string }>(
    graph(p.version, 'oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: p.appId,
      client_secret: p.appSecret,
      fb_exchange_token: p.token,
    }),
    f,
  )
  return cuerpo.access_token
}

export type InfoToken = {
  readonly tipo: string
  readonly appId: string
  readonly valido: boolean
  /** null = no vence. */
  readonly venceEn: Date | null
  readonly permisos: readonly string[]
}

export async function inspeccionarToken(
  p: Credenciales & { token: string },
  f: Fetch,
): Promise<InfoToken> {
  const { data } = await pedir<{
    data: {
      type: string
      app_id: string
      is_valid: boolean
      expires_at: number
      scopes?: string[]
    }
  }>(
    graph(p.version, 'debug_token', {
      input_token: p.token,
      access_token: `${p.appId}|${p.appSecret}`,
    }),
    f,
  )
  return {
    tipo: data.type,
    appId: data.app_id,
    valido: data.is_valid,
    venceEn: data.expires_at === 0 ? null : new Date(data.expires_at * 1000),
    permisos: data.scopes ?? [],
  }
}

/**
 * ¿Este token ve el Business del cliente? Evita que cualquiera que pase por el
 * login conecte su propia cuenta y pise el token de la ingesta.
 */
export async function verificarAccesoNegocio(
  p: { version: string; token: string; businessId: string },
  f: Fetch,
): Promise<boolean> {
  try {
    await pedir(graph(p.version, p.businessId, { fields: 'id', access_token: p.token }), f)
    return true
  } catch (error) {
    if (error instanceof ErrorMeta) return false
    throw error
  }
}

export const permisosFaltantes = (otorgados: readonly string[]): string[] =>
  PERMISOS_MVP.filter((p) => !otorgados.includes(p))
