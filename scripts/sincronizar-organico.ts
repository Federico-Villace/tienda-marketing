/**
 * Corre la ingesta orgánica (IG + FB) desde la máquina, sin esperar al cron.
 *
 *   pnpm sincronizar-organico
 *
 * Escribe en Supabase (la base que apunta .env.local). Imprime el resumen por
 * cuenta; todo texto pasa por textoSeguro, nunca sale un token.
 */

import { leerTokenMeta } from '../lib/meta/boveda.ts'
import { ORGANIZACION_PILOTO_ID } from '../lib/organizacion.ts'
import { sincronizarOrganico } from '../lib/ingesta/sincronizar-organico.ts'
import { textoSeguro } from '../lib/ingesta/transformar-organico.ts'

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

try {
  const r = await sincronizarOrganico({
    meta: { version: env('META_API_VERSION') ?? 'v26.0', token },
    supabase,
    organizacionId: ORGANIZACION_PILOTO_ID,
    hoy: new Date(),
    f: fetch,
    esperar: (ms) => new Promise((ok) => setTimeout(ok, ms)),
  })

  for (const c of r.cuentas) {
    console.log(
      textoSeguro(
        `${c.error ? '✗' : '✓'} ${c.nombre} (${c.red}) · ${c.publicaciones} publicaciones · ${c.metricas} métricas · ${c.recuperadas} recuperadas una por una · ${c.sinMetricas} sin métricas${c.error ? ` · ${c.error}` : ''}${c.errorMensajes ? ` · mensajes: ${c.errorMensajes}` : ''}`,
        [token],
      ),
    )
  }
  console.log(`\n${r.estado} · ${r.filas} filas${r.error && r.cuentas.length === 0 ? ` · ${textoSeguro(r.error, [token])}` : ''}`)
  // parcial sale con 0: lo cargado quedó guardado; el detalle de lo que falló ya se imprimió arriba.
  process.exit(r.estado === 'error' ? 1 : 0)
} catch (e) {
  console.error(textoSeguro(e, [token]))
  process.exit(1)
}
