/**
 * Mensajes recibidos por cuenta para el tablero (ADR-020). Lee de Postgres,
 * nunca de Meta: la suma por cuenta la hace resumen_mensajes (migración
 * 20261024120000). Solo conteos: ningún contenido ni participante pasa por acá.
 *
 * Solo servidor: usa la clave secreta.
 */

import { rpc, type Supabase } from '../supabase/rest.ts'
import type { Filtros } from './filtros.ts'
import { marcaDeCuenta, ordenarMarcas } from './marcas.ts'
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

type Suma = { readonly activas: number | null; readonly nuevas: number | null; readonly mensajes: number | null }

/** Suma ignorando los null (Meta no lo informa); null si ninguno informa. Nunca inventa un 0. */
const sumarInformados = (valores: readonly (number | null)[]): number | null => {
  const informados = valores.filter((v): v is number => v !== null)
  return informados.length === 0 ? null : informados.reduce((a, b) => a + b, 0)
}

function sumarCuentas(cuentas: readonly MensajesCuenta[]): Suma | null {
  if (cuentas.length === 0) return null
  const suma = {
    activas: sumarInformados(cuentas.map((c) => c.activas)),
    nuevas: sumarInformados(cuentas.map((c) => c.nuevas)),
    mensajes: sumarInformados(cuentas.map((c) => c.mensajes)),
  }
  return suma.activas === null && suma.nuevas === null && suma.mensajes === null ? null : suma
}

export type MensajesDeMarcas = {
  /** Una por marca elegida, en el orden de MARCAS; null donde no hay datos de esa plataforma. */
  readonly porMarca: readonly {
    readonly marcaId: string
    readonly facebook: MensajesCuenta | null
    readonly instagram: MensajesCuenta | null
  }[]
  readonly total: { readonly facebook: Suma | null; readonly instagram: Suma | null }
}

/** Las cuentas de las marcas elegidas (respetando la plataforma) y su suma por plataforma. */
export function mensajesDeMarcas(
  cuentas: readonly MensajesCuenta[],
  f: Pick<Filtros, 'marcaIds' | 'plataforma'>,
): MensajesDeMarcas {
  const de = (marcaId: string, p: Plataforma) =>
    f.plataforma === 'todas' || f.plataforma === p
      ? (cuentas.find((c) => c.marcaId === marcaId && c.plataforma === p) ?? null)
      : null
  const porMarca = ordenarMarcas(f.marcaIds).map((marcaId) => ({
    marcaId,
    facebook: de(marcaId, 'facebook'),
    instagram: de(marcaId, 'instagram'),
  }))
  const juntar = (k: 'facebook' | 'instagram') => sumarCuentas(porMarca.flatMap((m) => (m[k] ? [m[k]] : [])))
  return { porMarca, total: { facebook: juntar('facebook'), instagram: juntar('instagram') } }
}
