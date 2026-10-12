/**
 * Diagnóstico del token de Meta que quedó en Vault.
 *
 *   pnpm diagnostico-meta
 *
 * Lee el token por el RPC leer_token_meta (clave secreta, solo local) y le
 * pega a Meta con ESE token: debug_token, /me/permissions, activos del
 * Business e insights de la cuenta publicitaria. Solo lectura.
 *
 * Imprime metadatos y errores de Meta. Nunca el token ni ninguna clave: para
 * comparar contra META_ACCESS_TOKEN muestra la huella (sha256 recortado).
 */

import { leerTokenMeta } from '../lib/meta/boveda.ts'
import { diagnosticarToken, huella } from '../lib/meta/diagnostico.ts'

const REQUERIDAS = [
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

const token = await leerTokenMeta(
  { url: env('NEXT_PUBLIC_SUPABASE_URL')!, secretKey: env('SUPABASE_SECRET_KEY')! },
  fetch,
)
if (!token) {
  console.error('Vault no tiene token: nadie conectó todavía desde Configuración.')
  process.exit(1)
}

const deEntorno = env('META_ACCESS_TOKEN')
const informe = await diagnosticarToken(
  {
    appId: env('META_APP_ID')!,
    appSecret: env('META_APP_SECRET')!,
    version: env('META_API_VERSION') ?? 'v26.0',
    token,
    businessId: env('META_BUSINESS_ID')!,
    adAccountId: env('META_AD_ACCOUNT_ID'),
  },
  fetch,
)

console.log(
  JSON.stringify(
    {
      token_usado: 'vault:meta_access_token',
      huella_vault: await huella(token),
      huella_META_ACCESS_TOKEN: deEntorno ? await huella(deEntorno) : 'no definida',
      coinciden: deEntorno ? deEntorno === token : false,
      informe,
    },
    null,
    2,
  ),
)
