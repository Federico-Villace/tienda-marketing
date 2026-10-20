/**
 * POST /api/actualizar: el botón "Actualizar estadísticas" del tablero.
 *
 * Corre en el servidor las MISMAS sincronizaciones que el cron (publicidad y
 * después orgánico). El navegador no escribe nada (regla dura #5): solo pide.
 *
 * Límite de uso, leyendo `sincronizaciones` (no hace falta tabla nueva):
 *   - hay una corrida `corriendo` de menos de 10 min → 409
 *   - la última corrida (de cualquier tipo) arrancó hace menos de 15 min → 429
 * Una `corriendo` de más de 10 min se da por muerta (la función murió sin
 * cerrarla) y no bloquea: si no, un corte dejaría el botón trabado para siempre.
 */

import { autorizarMiembro } from '../agentes/autorizar.ts'
import { leerTokenMeta } from '../meta/boveda.ts'
import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { seleccionar } from '../supabase/rest.ts'
import type { Dependencias, EstadoSync } from './sincronizar.ts'
import { textoSeguro } from './transformar-organico.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

/** Cuánto esperar entre una actualización y la siguiente. */
export const MINUTOS_ENFRIAMIENTO = 15
/** Una corrida `corriendo` más vieja que esto se considera muerta. */
export const MINUTOS_CORRIDA_VIVA = 10

const MINUTO_MS = 60_000

type Resultado = {
  readonly estado: EstadoSync
  readonly filas: number
  readonly cuentas: readonly { readonly cuenta: string; readonly error?: string }[]
  readonly error?: string
}
export type Sincronizadores = {
  readonly publicidad: (d: Dependencias) => Promise<Resultado>
  readonly organico: (d: Dependencias) => Promise<Resultado>
}

export type ResumenTipo = { readonly estado: EstadoSync; readonly filas: number; readonly resumen: string; readonly error?: string }

const responder = (cuerpo: unknown, status: number, headers?: Record<string, string>) =>
  Response.json(cuerpo, { status, ...(headers ? { headers } : {}) })

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

function resumir(r: Resultado, token: string): ResumenTipo {
  const fallidas = r.cuentas.filter((c) => c.error).length
  const resumen =
    r.estado === 'error' && r.cuentas.length === 0
      ? 'No se pudo actualizar'
      : r.estado === 'ok'
        ? `${plural(r.cuentas.length, 'cuenta', 'cuentas')} · ${plural(r.filas, 'fila', 'filas')}`
        : `${r.cuentas.length - fallidas} de ${plural(r.cuentas.length, 'cuenta', 'cuentas')} · ${plural(r.filas, 'fila', 'filas')}`
  return {
    estado: r.estado,
    filas: r.filas,
    resumen,
    ...(r.error ? { error: textoSeguro(r.error, [token]) } : {}),
  }
}

/** Una sincronización que lanza no frena a la otra: queda como error, sin token. */
async function correr(sincronizar: (d: Dependencias) => Promise<Resultado>, d: Dependencias, token: string): Promise<ResumenTipo> {
  try {
    return resumir(await sincronizar(d), token)
  } catch (e) {
    return { estado: 'error', filas: 0, resumen: 'No se pudo actualizar', error: textoSeguro(e, [token]) }
  }
}

export async function manejarActualizar(
  request: Request,
  entorno: Entorno,
  f: Fetch,
  sincronizadores: Sincronizadores,
  ahora: Date = new Date(),
): Promise<Response> {
  const miembro = await autorizarMiembro(request, entorno, 'actualizar las estadísticas', f)
  if (miembro instanceof Response) return miembro
  const { supabase } = miembro

  const desde = new Date(ahora.getTime() - MINUTOS_ENFRIAMIENTO * MINUTO_MS).toISOString()
  let corridas: { estado: string; iniciada_en: string }[]
  try {
    corridas = await seleccionar(
      supabase,
      'sincronizaciones',
      {
        select: 'tipo,estado,iniciada_en',
        organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`,
        tipo: 'in.(campanias,publicaciones)',
        iniciada_en: `gte.${desde}`,
        order: 'iniciada_en.desc',
      },
      f,
    )
  } catch {
    return responder({ error: 'No se pudo verificar el estado de las sincronizaciones. Probá de nuevo en un momento.' }, 500)
  }

  const edadMin = (iso: string) => (ahora.getTime() - new Date(iso).getTime()) / MINUTO_MS
  if (corridas.some((c) => c.estado === 'corriendo' && edadMin(c.iniciada_en) < MINUTOS_CORRIDA_VIVA)) {
    return responder({ error: 'Ya hay una actualización en curso' }, 409)
  }
  const ultima = corridas
    .filter((c) => c.estado !== 'corriendo' && edadMin(c.iniciada_en) < MINUTOS_ENFRIAMIENTO)
    .map((c) => new Date(c.iniciada_en).getTime())
  if (ultima.length > 0) {
    const faltanSeg = Math.ceil((Math.max(...ultima) + MINUTOS_ENFRIAMIENTO * MINUTO_MS - ahora.getTime()) / 1000)
    const minutos = Math.max(1, Math.ceil(faltanSeg / 60))
    return responder(
      { error: `Probá de nuevo en ${plural(minutos, 'minuto', 'minutos')}` },
      429,
      { 'retry-after': String(Math.max(1, faltanSeg)) },
    )
  }

  let token: string | null
  try {
    token = await leerTokenMeta(supabase, f)
  } catch {
    return responder({ error: 'No se pudo leer el token de Meta de Vault.' }, 503)
  }
  if (!token) return responder({ error: 'Vault no tiene el token de Meta. Correr pnpm guardar-token-meta.' }, 503)

  const dependencias: Dependencias = {
    meta: { version: entorno.META_API_VERSION?.trim() || 'v26.0', token },
    supabase,
    organizacionId: ORGANIZACION_PILOTO_ID,
    hoy: ahora,
    f,
    esperar: dormir,
  }

  // En serie: las dos comparten la cuota de la Graph API (ADR-010).
  const publicidad = await correr(sincronizadores.publicidad, dependencias, token)
  const organico = await correr(sincronizadores.organico, dependencias, token)

  const status = publicidad.estado === 'error' && organico.estado === 'error' ? 502 : 200
  return responder({ publicidad, organico }, status)
}
