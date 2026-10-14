/**
 * POST /api/auth/login y /api/auth/logout (ADR-015).
 *
 * Entra quien tenga usuario en Supabase Auth **y** sea miembro de la
 * organización piloto. Los usuarios los da de alta Federico con
 * `pnpm alta-usuario`: no hay registro abierto.
 */

import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { seleccionar } from '../supabase/rest.ts'
import { COOKIE_ACCESO, cookiesBorradas, cookiesDeSesion, leerCookie, proyectoPublico } from './acceso.ts'
import { iniciarSesion } from './supabase-auth.ts'

type Entorno = Record<string, string | undefined>

/** Solo rutas internas. Evita el open redirect (`//malo.com`, `/\malo.com`). */
export function destinoSeguro(volver: string | undefined | null): string {
  if (!volver || !volver.startsWith('/') || volver.startsWith('//') || volver.startsWith('/\\')) return '/'
  if (volver === '/login' || volver.startsWith('/login?')) return '/'
  return volver
}

function redirigir(request: Request, ruta: string, cookies: readonly string[] = []): Response {
  const headers = new Headers({ location: new URL(ruta, request.url).toString() })
  for (const c of cookies) headers.append('set-cookie', c)
  return new Response(null, { status: 303, headers })
}

function aLogin(request: Request, error: string, volver: string) {
  const params = new URLSearchParams({ error })
  if (volver !== '/') params.set('volver', volver)
  return redirigir(request, `/login?${params}`)
}

export async function procesarLogin(request: Request, entorno: Entorno, f: typeof fetch): Promise<Response> {
  const datos = await request.formData()
  const email = String(datos.get('email') ?? '').trim()
  const password = String(datos.get('password') ?? '')
  const volver = destinoSeguro(datos.get('volver') as string | null)

  const proyecto = proyectoPublico(entorno)
  const secretKey = entorno.SUPABASE_SECRET_KEY?.trim()
  if (!proyecto || !secretKey) return aLogin(request, 'sin_config', volver)
  if (!email || !password) return aLogin(request, 'credenciales', volver)

  const sesion = await iniciarSesion({ ...proyecto, email, password }, f)
  if (!sesion) return aLogin(request, 'credenciales', volver)

  const membresia = await seleccionar(
    { url: proyecto.url, secretKey },
    'miembros',
    {
      select: 'rol',
      usuario_id: `eq.${sesion.usuario.id}`,
      organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`,
      limit: '1',
    },
    f,
  )
  if (membresia.length === 0) return aLogin(request, 'sin_acceso', volver)

  return redirigir(request, volver, cookiesDeSesion(request, sesion))
}

export async function procesarLogout(request: Request, entorno: Entorno, f: typeof fetch): Promise<Response> {
  const proyecto = proyectoPublico(entorno)
  const acceso = leerCookie(request, COOKIE_ACCESO)
  if (proyecto && acceso) {
    // Revoca el refresh token en Supabase. Si falla, la sesión local se cierra igual.
    await f(`${proyecto.url}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: proyecto.key, authorization: `Bearer ${acceso}` },
    }).catch(() => undefined)
  }
  return redirigir(request, '/login', cookiesBorradas(request))
}
