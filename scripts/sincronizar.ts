/**
 * Corre la ingesta de publicidad desde la máquina, sin esperar al cron.
 *
 *   pnpm sincronizar
 *
 * Escribe en Supabase (la base que apunta .env.local). Imprime el resumen por
 * cuenta, nunca el token.
 */

import { leerTokenMeta } from '../lib/meta/boveda.ts'
import { ORGANIZACION_PILOTO_ID } from '../lib/organizacion.ts'
import { sincronizarPublicidad } from '../lib/ingesta/sincronizar.ts'

const env = (n: string) => process.env[n]?.trim() || undefined
const url = env('NEXT_PUBLIC_SUPABASE_URL')
const secretKey = env('SUPABASE_SECRET_KEY')
if (!url || !secretKey) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY')
  process.exit(1)
}

const supabase = { url, secretKey }
const token = await leerTokenMeta(supabase, fetch)
if (!token) {
  console.error('Vault no tiene el token de Meta. Correr pnpm guardar-token-meta.')
  process.exit(1)
}

const r = await sincronizarPublicidad({
  meta: { version: env('META_API_VERSION') ?? 'v26.0', token },
  supabase,
  organizacionId: ORGANIZACION_PILOTO_ID,
  hoy: new Date(),
  f: fetch,
  esperar: (ms) => new Promise((ok) => setTimeout(ok, ms)),
})

for (const c of r.cuentas) {
  console.log(`${c.error ? '✗' : '✓'} ${c.nombre} · ${c.campanias} campañas · ${c.metricas} días-campaña${c.error ? ` · ${c.error}` : ''}`)
}
console.log(`\n${r.estado} · ${r.filas} filas`)
process.exit(r.estado === 'ok' ? 0 : 1)
