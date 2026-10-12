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

type DatosError = {
  readonly codigo?: number
  readonly subcodigo?: number
  readonly tipo?: string
  readonly fbtraceId?: string
}

/** Error de la Graph API con lo necesario para diagnosticarlo (nunca el token). */
export class ErrorMeta extends Error {
  override name = 'ErrorMeta'
  readonly codigo?: number
  readonly subcodigo?: number
  readonly tipo?: string
  readonly fbtraceId?: string

  constructor(mensaje: string, datos: DatosError = {}) {
    super(mensaje)
    this.codigo = datos.codigo
    this.subcodigo = datos.subcodigo
    this.tipo = datos.tipo
    this.fbtraceId = datos.fbtraceId
  }
}

/** "(#200/1815002) mensaje": el formato con el que Meta documenta sus errores. */
export function describirError(e: ErrorMeta): string {
  if (e.codigo === undefined) return e.message
  const sub = e.subcodigo === undefined ? '' : `/${e.subcodigo}`
  return `(#${e.codigo}${sub}) ${e.message}`
}

type Credenciales = {
  readonly appId: string
  readonly appSecret: string
  readonly version: string
}

export const graph = (version: string, ruta: string, params: Record<string, string>) => {
  const url = new URL(`https://graph.facebook.com/${version}/${ruta}`)
  for (const [clave, valor] of Object.entries(params)) url.searchParams.set(clave, valor)
  return url
}

type ErrorGraph = {
  message?: string
  type?: string
  code?: number
  error_subcode?: number
  fbtrace_id?: string
}

/** GET a la Graph API. Si Meta responde con error, tira ErrorMeta con sus datos. */
export async function pedir<T>(url: URL, f: Fetch): Promise<T> {
  const respuesta = await f(url)
  const cuerpo = (await respuesta.json()) as T & { error?: ErrorGraph }
  if (!respuesta.ok || cuerpo.error) {
    const e = cuerpo.error
    throw new ErrorMeta(e?.message ?? `Meta respondió ${respuesta.status}`, {
      codigo: e?.code,
      subcodigo: e?.error_subcode,
      tipo: e?.type,
      fbtraceId: e?.fbtrace_id,
    })
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
      granular_scopes?: { scope: string; target_ids?: string[] }[]
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
    // Login for Business puede listar un permiso solo en granular_scopes (atado
    // a activos puntuales). Leer solo `scopes` daba falsos "faltan".
    permisos: [
      ...new Set([...(data.scopes ?? []), ...(data.granular_scopes ?? []).map((g) => g.scope)]),
    ],
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
