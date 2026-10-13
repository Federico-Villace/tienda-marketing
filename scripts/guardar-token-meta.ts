/**
 * Pasa META_ACCESS_TOKEN (.env.local) a Supabase Vault.
 *
 *   pnpm guardar-token-meta
 *
 * Antes de guardar valida lo mismo que el callback del login: token válido, de
 * nuestra app, con los permisos del MVP y con acceso al Business. Si algo
 * falla, no toca Vault. Nunca imprime el token (ADR-013).
 */

import { importarToken } from '../lib/meta/importar.ts'
import { describirError, ErrorMeta } from '../lib/meta/oauth.ts'
import { huella } from '../lib/meta/diagnostico.ts'

const REQUERIDAS = [
  'META_ACCESS_TOKEN',
  'META_APP_ID',
  'META_APP_SECRET',
  'META_BUSINESS_ID',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
] as const

const env = (n: string) => process.env[n]?.trim() || undefined

const faltan = REQUERIDAS.filter((n) => !env(n))
if (faltan.length > 0) {
  console.error(`Faltan variables: ${faltan.join(', ')}`)
  process.exit(1)
}

const token = env('META_ACCESS_TOKEN')!

try {
  const r = await importarToken(
    {
      token,
      appId: env('META_APP_ID')!,
      appSecret: env('META_APP_SECRET')!,
      version: env('META_API_VERSION') ?? 'v26.0',
      businessId: env('META_BUSINESS_ID')!,
      supabaseUrl: env('NEXT_PUBLIC_SUPABASE_URL')!,
      secretKey: env('SUPABASE_SECRET_KEY')!,
    },
    fetch,
  )
  if (!r.ok) {
    console.error(`No se guardó: ${r.motivo}${r.faltan ? ` (faltan ${r.faltan.join(', ')})` : ''}`)
    process.exit(1)
  }
  console.log(`Guardado en Vault · ${r.tipo} · vence: ${r.vence} · huella ${await huella(token)}`)
} catch (e) {
  console.error(e instanceof ErrorMeta ? `Meta: ${describirError(e)}` : String(e))
  process.exit(1)
}
