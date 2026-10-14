/**
 * Da de alta a una persona para que pueda entrar a la plataforma.
 *
 *   pnpm alta-usuario julian@999motos.com.ar director
 *
 * Crea el usuario en Supabase Auth con una clave aleatoria y lo hace miembro de
 * la organización piloto. Roles: director | operador | lector (por defecto).
 *
 * La clave se imprime UNA vez. Correlo en tu terminal, no dentro del chat, y
 * pasásela a la persona por un canal privado.
 */

import { randomBytes } from 'node:crypto'
import { darDeAlta, type Rol } from '../lib/auth/alta.ts'

const ROLES: readonly Rol[] = ['director', 'operador', 'lector']

const [email, rolPedido = 'lector'] = process.argv.slice(2)
const rol = rolPedido as Rol
if (!email || !email.includes('@') || !ROLES.includes(rol)) {
  console.error('Uso: pnpm alta-usuario <email> [director|operador|lector]')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim()
if (!url || !secretKey) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY')
  process.exit(1)
}

const r = await darDeAlta({ url, secretKey, email, rol }, fetch, () => randomBytes(12).toString('base64url'))

console.log(`✓ ${r.usuario.email} es ${rol} de 999 Motos`)
console.log(
  r.clave
    ? `Clave inicial: ${r.clave}\n(se muestra una sola vez: pasala por un canal privado)`
    : 'El usuario ya existía: conserva su clave de siempre.',
)
