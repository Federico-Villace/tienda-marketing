/**
 * Alta de una persona: usuario en Supabase Auth + miembro de la organización.
 * Solo la corre Federico, desde su máquina, con `pnpm alta-usuario` (ADR-015).
 */

import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { upsert } from '../supabase/rest.ts'
import { buscarUsuarioPorEmail, crearUsuario, type Usuario } from './supabase-auth.ts'

export type Rol = 'director' | 'operador' | 'lector'

export async function darDeAlta(
  p: { url: string; secretKey: string; email: string; rol: Rol },
  f: typeof fetch,
  generarClave: () => string,
): Promise<{ usuario: Usuario; clave: string | null }> {
  const admin = { url: p.url, key: p.secretKey }
  const email = p.email.trim().toLowerCase()

  const clave = generarClave()
  const creado = await crearUsuario({ ...admin, email, password: clave }, f)
  const usuario = creado ?? (await buscarUsuarioPorEmail({ ...admin, email }, f))
  if (!usuario) throw new Error(`Supabase dice que ${email} existe pero no aparece en la lista`)

  await upsert(
    { url: p.url, secretKey: p.secretKey },
    'miembros',
    [{ organizacion_id: ORGANIZACION_PILOTO_ID, usuario_id: usuario.id, rol: p.rol }],
    'organizacion_id,usuario_id',
    f,
  )
  return { usuario, clave: creado ? clave : null }
}
