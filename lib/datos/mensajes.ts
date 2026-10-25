/**
 * Mensajes recibidos por cuenta para el tablero (ADR-020). Lee de Postgres,
 * nunca de Meta: la suma por cuenta la hace resumen_mensajes (migración
 * 20261024120000). Solo conteos: ningún contenido ni participante pasa por acá.
 *
 * Solo servidor: usa la clave secreta.
 */

import { rpc, type Supabase } from '../supabase/rest.ts'
import type { Filtros } from './filtros.ts'
import { marcaDeCuenta } from './marcas.ts'
import type { Plataforma } from './tipos.ts'

type Fetch = typeof fetch

export type MensajesCuenta = {
  readonly marcaId: string
  readonly plataforma: Plataforma
  /** Conversaciones cuya última actividad cayó en el período. */
  readonly activas: number | null
  /** Solo Messenger: Instagram no tiene métrica de conversaciones nuevas. */
  readonly nuevas: number | null
  /** Solo Messenger: Instagram no informa message_count. */
  readonly mensajes: number | null
}

type FilaResumen = {
  tipo: string
  meta_id: string
  conversaciones_activas: number | string | null
  conversaciones_nuevas: number | string | null
  mensajes: number | string | null
}

/** bigint llega como string desde PostgREST; null (Meta no lo informa) se conserva. */
const numero = (v: number | string | null) => (v === null ? null : Number(v))

export async function leerMensajes(
  s: Supabase,
  organizacionId: string,
  desde: string,
  f: Fetch,
  /** Tope superior inclusive (YYYY-MM-DD). Sin él, hasta hoy. */
  hasta?: string,
): Promise<readonly MensajesCuenta[]> {
  const filas = await rpc<FilaResumen[]>(
    s,
    'resumen_mensajes',
    { p_organizacion: organizacionId, p_desde: desde, ...(hasta ? { p_hasta: hasta } : {}) },
    f,
  )
  return filas.flatMap((x): MensajesCuenta[] => {
    const marca = marcaDeCuenta(x.meta_id)
    if (!marca || (x.tipo !== 'facebook' && x.tipo !== 'instagram')) return []
    return [
      {
        marcaId: marca.id,
        plataforma: x.tipo,
        activas: numero(x.conversaciones_activas),
        nuevas: numero(x.conversaciones_nuevas),
        mensajes: numero(x.mensajes),
      },
    ]
  })
}

/** Las cuentas de la marca elegida, respetando el filtro de plataforma. */
export function mensajesDeMarca(
  cuentas: readonly MensajesCuenta[],
  f: Pick<Filtros, 'marcaIds' | 'plataforma'>,
): { readonly facebook: MensajesCuenta | null; readonly instagram: MensajesCuenta | null } {
  // Provisorio (L1): una sola marca. mensajesDeMarcas lo reemplaza en L2.
  const marcaId = f.marcaIds[0]
  const de = (p: Plataforma) =>
    f.plataforma === 'todas' || f.plataforma === p
      ? (cuentas.find((c) => c.marcaId === marcaId && c.plataforma === p) ?? null)
      : null
  return { facebook: de('facebook'), instagram: de('instagram') }
}
