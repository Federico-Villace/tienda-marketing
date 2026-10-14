/**
 * Supabase Auth por REST (ADR-015). Email + contraseña, sin registro abierto.
 *
 * - Sesión y verificación: clave publicable. Es pública por diseño.
 * - Alta de usuarios: clave secreta, solo desde scripts/alta-usuario.ts.
 *
 * Sin SDK, con fetch inyectado, igual que el resto de lib/.
 */

type Fetch = typeof fetch
type Proyecto = { readonly url: string; readonly key: string }

export type Usuario = { readonly id: string; readonly email: string }

export type Sesion = {
  readonly accessToken: string
  readonly refreshToken: string
  /** Segundos de vida del access token. */
  readonly expiraEn: number
  readonly usuario: Usuario
}

type RespuestaToken = {
  access_token: string
  refresh_token: string
  expires_in: number
  user: { id: string; email: string }
}

async function pedirToken(p: Proyecto, grant: string, cuerpo: object, f: Fetch): Promise<Sesion | null> {
  const r = await f(`${p.url}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST',
    headers: { apikey: p.key, 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo),
  })
  // 4xx = credenciales o refresh inválidos: es un "no", no una falla del sistema.
  if (r.status >= 400 && r.status < 500) return null
  if (!r.ok) throw new Error(`Supabase Auth respondió ${r.status}`)
  const t = (await r.json()) as RespuestaToken
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiraEn: t.expires_in,
    usuario: { id: t.user.id, email: t.user.email },
  }
}

export const iniciarSesion = (p: Proyecto & { email: string; password: string }, f: Fetch) =>
  pedirToken(p, 'password', { email: p.email, password: p.password }, f)

export const renovarSesion = (p: Proyecto & { refreshToken: string }, f: Fetch) =>
  pedirToken(p, 'refresh_token', { refresh_token: p.refreshToken }, f)

/** La fuente de verdad: Supabase dice si el token es válido y de quién es. */
export async function verificarUsuario(
  p: Proyecto & { accessToken: string },
  f: Fetch,
): Promise<Usuario | null> {
  const r = await f(`${p.url}/auth/v1/user`, {
    headers: { apikey: p.key, authorization: `Bearer ${p.accessToken}` },
  })
  if (r.status >= 400 && r.status < 500) return null
  if (!r.ok) throw new Error(`Supabase Auth respondió ${r.status}`)
  const u = (await r.json()) as { id: string; email: string }
  return { id: u.id, email: u.email }
}

/** null = el email ya existe. */
export async function crearUsuario(
  p: Proyecto & { email: string; password: string },
  f: Fetch,
): Promise<Usuario | null> {
  const r = await f(`${p.url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: p.key, 'content-type': 'application/json' },
    body: JSON.stringify({ email: p.email, password: p.password, email_confirm: true }),
  })
  if (r.status === 422) return null
  if (!r.ok) throw new Error(`Supabase Auth respondió ${r.status} al crear el usuario`)
  const u = (await r.json()) as { id: string; email: string }
  return { id: u.id, email: u.email }
}

export async function buscarUsuarioPorEmail(
  p: Proyecto & { email: string },
  f: Fetch,
): Promise<Usuario | null> {
  const r = await f(`${p.url}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: { apikey: p.key },
  })
  if (!r.ok) throw new Error(`Supabase Auth respondió ${r.status} al listar usuarios`)
  const { users } = (await r.json()) as { users: { id: string; email: string }[] }
  const buscado = p.email.toLowerCase()
  const u = users.find((x) => x.email?.toLowerCase() === buscado)
  return u ? { id: u.id, email: u.email } : null
}
