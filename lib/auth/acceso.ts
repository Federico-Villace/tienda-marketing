/**
 * Quién entra (ADR-015). Lo llama proxy.ts en cada pedido.
 *
 * - Access token válido → pasa.
 * - Access vencido + refresh válido → renueva, pasa y deja cookies nuevas.
 * - Nada válido → login (páginas) o 401 (APIs).
 * - Supabase caído o sin configurar → 503. Falla CERRADO: nunca deja pasar por error.
 *
 * Request → resultado, sin Next adentro, para testearlo sin servidor.
 */

import { renovarSesion, verificarUsuario, type Sesion } from './supabase-auth.ts'

type Entorno = Record<string, string | undefined>

export const COOKIE_ACCESO = 'sesion_acceso'
export const COOKIE_RENOVAR = 'sesion_renovar'
const VIDA_RENOVAR_S = 60 * 60 * 24 * 30

/** Login, su POST y los crons (que tiene su propio CRON_SECRET). */
const RUTAS_PUBLICAS = new Set(['/login', '/api/auth/login', '/api/sync', '/api/sync-organico'])

/**
 * Header por el que el proxy le dice al handler QUIÉN es el usuario ya
 * verificado. Cuando el access vence, el proxy renueva pero el request que
 * llega al handler sigue trayendo la cookie vieja; renovar otra vez rotaría el
 * refresh token y le invalidaría al proxy el que acaba de setear.
 */
export const HEADER_USUARIO = 'x-usuario-id'

export type ResultadoAcceso =
  | { readonly tipo: 'pasar'; readonly setCookies?: readonly string[]; readonly usuarioId?: string }
  | { readonly tipo: 'responder'; readonly respuesta: Response }

/**
 * Headers que ve el handler. SEGURIDAD: se borra SIEMPRE el x-usuario-id que
 * mande el cliente (Headers no distingue mayúsculas) antes de poner el
 * verificado; si no, cualquiera se haría pasar por otro usuario.
 */
export function encabezadosHaciaAdentro(request: Request, usuarioId?: string): Headers {
  const headers = new Headers(request.headers)
  headers.delete(HEADER_USUARIO)
  if (usuarioId) headers.set(HEADER_USUARIO, usuarioId)
  return headers
}

export function leerCookie(request: Request, nombre: string): string | undefined {
  for (const parte of (request.headers.get('cookie') ?? '').split(';')) {
    const [clave, ...resto] = parte.trim().split('=')
    if (clave === nombre) return resto.join('=') || undefined
  }
  return undefined
}

const atributos = (request: Request, maxAge: number) => {
  const segura = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return `Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${segura}`
}

export const cookiesDeSesion = (request: Request, s: Sesion): string[] => [
  `${COOKIE_ACCESO}=${s.accessToken}; ${atributos(request, s.expiraEn)}`,
  `${COOKIE_RENOVAR}=${s.refreshToken}; ${atributos(request, VIDA_RENOVAR_S)}`,
]

export const cookiesBorradas = (request: Request): string[] => [
  `${COOKIE_ACCESO}=; ${atributos(request, 0)}`,
  `${COOKIE_RENOVAR}=; ${atributos(request, 0)}`,
]

export function proyectoPublico(entorno: Entorno) {
  const url = entorno.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = entorno.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
  return url && key ? { url, key } : null
}

const cerrado = (mensaje: string): ResultadoAcceso => ({
  tipo: 'responder',
  respuesta: new Response(mensaje, { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } }),
})

function sinSesion(request: Request): ResultadoAcceso {
  const url = new URL(request.url)
  const headers = new Headers()
  for (const c of cookiesBorradas(request)) headers.append('set-cookie', c)

  if (url.pathname.startsWith('/api/')) {
    headers.set('content-type', 'application/json')
    return {
      tipo: 'responder',
      respuesta: new Response(JSON.stringify({ error: 'Iniciá sesión.' }), { status: 401, headers }),
    }
  }

  const login = new URL('/login', url)
  login.searchParams.set('volver', url.pathname + url.search)
  headers.set('location', login.toString())
  return { tipo: 'responder', respuesta: new Response(null, { status: 307, headers }) }
}

export async function controlarAcceso(
  request: Request,
  entorno: Entorno,
  f: typeof fetch,
): Promise<ResultadoAcceso> {
  if (RUTAS_PUBLICAS.has(new URL(request.url).pathname)) return { tipo: 'pasar' }

  const proyecto = proyectoPublico(entorno)
  if (!proyecto) return cerrado('Login sin configurar: faltan las variables de Supabase.')

  try {
    const acceso = leerCookie(request, COOKIE_ACCESO)
    const usuario = acceso ? await verificarUsuario({ ...proyecto, accessToken: acceso }, f) : null
    if (usuario) return { tipo: 'pasar', usuarioId: usuario.id }

    const renovar = leerCookie(request, COOKIE_RENOVAR)
    const sesion = renovar ? await renovarSesion({ ...proyecto, refreshToken: renovar }, f) : null
    if (sesion) {
      return { tipo: 'pasar', setCookies: cookiesDeSesion(request, sesion), usuarioId: sesion.usuario.id }
    }

    return sinSesion(request)
  } catch {
    return cerrado('No se pudo verificar la sesión. Probá de nuevo en un momento.')
  }
}
