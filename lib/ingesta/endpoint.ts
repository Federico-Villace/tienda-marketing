/**
 * GET /api/sync y /api/sync-organico: los llama el cron de Vercel una vez por día (y a mano para la
 * demo). Vercel manda `Authorization: Bearer $CRON_SECRET` solo; sin ese
 * secreto configurado el endpoint no corre nunca.
 */

import { leerTokenMeta } from '../meta/boveda.ts'
import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import type { Dependencias } from './sincronizar.ts'

type Entorno = Record<string, string | undefined>
/** Sirve para publicidad y para orgánico: al endpoint solo le importa el estado (parcial = 200: la mayoría cargó; el detalle va en `error`). */
type Sincronizar = (d: Dependencias) => Promise<{ readonly estado: 'ok' | 'parcial' | 'error' }>

const responder = (cuerpo: unknown, status: number) => Response.json(cuerpo, { status })

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function manejarSync(
  request: Request,
  entorno: Entorno,
  f: typeof fetch,
  sincronizar: Sincronizar,
): Promise<Response> {
  const secreto = entorno.CRON_SECRET?.trim()
  if (!secreto) return responder({ error: 'Falta CRON_SECRET: el sync no corre sin él.' }, 500)
  if (request.headers.get('authorization') !== `Bearer ${secreto}`) {
    return responder({ error: 'No autorizado.' }, 401)
  }

  const url = entorno.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const secretKey = entorno.SUPABASE_SECRET_KEY?.trim()
  if (!url || !secretKey) return responder({ error: 'Faltan las variables de Supabase.' }, 500)
  const supabase = { url, secretKey }

  const token = await leerTokenMeta(supabase, f)
  if (!token) {
    return responder({ error: 'Vault no tiene el token de Meta. Correr pnpm guardar-token-meta.' }, 503)
  }

  const r = await sincronizar({
    meta: { version: entorno.META_API_VERSION?.trim() || 'v26.0', token },
    supabase,
    organizacionId: ORGANIZACION_PILOTO_ID,
    hoy: new Date(),
    f,
    esperar: dormir,
  })
  return responder(r, r.estado === 'error' ? 502 : 200)
}
