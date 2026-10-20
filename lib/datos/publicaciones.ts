/**
 * Publicaciones reales para el tablero. Lee de Postgres, nunca de Meta: la
 * última foto de métricas de cada post la elige la función
 * resumen_publicaciones (migración 20261020120000).
 *
 * Solo servidor: usa la clave secreta.
 */

import { rpc, seleccionar, type Supabase } from '../supabase/rest.ts'
import { marcaDeCuenta } from './marcas.ts'
import type { UltimaSync } from './publicidad.ts'
import type { Plataforma, Publicacion, TipoPublicacion } from './tipos.ts'

type Fetch = typeof fetch

export type PublicacionesReales = {
  readonly publicaciones: readonly Publicacion[]
  readonly ultimaSync: UltimaSync | null
}

type FilaResumen = {
  publicacion_id: string
  cuenta_meta_id: string
  plataforma: Plataforma
  tipo: string | null
  texto: string | null
  permalink: string | null
  publicado_en: string
  vistas: number | null
  alcance: number | null
  clics: number | null
  me_gusta: number | null
  comentarios: number | null
  compartidos: number | null
  guardados: number | null
}

export async function leerPublicaciones(
  s: Supabase,
  organizacionId: string,
  desde: string,
  f: Fetch,
  /** Tope superior inclusive (YYYY-MM-DD). Sin él, hasta hoy. */
  hasta?: string,
): Promise<PublicacionesReales> {
  const [filas, corridas] = await Promise.all([
    rpc<FilaResumen[]>(s, 'resumen_publicaciones', { p_organizacion: organizacionId, p_desde: desde, ...(hasta ? { p_hasta: hasta } : {}) }, f),
    seleccionar<{ estado: UltimaSync['estado']; terminada_en: string | null; error: string | null }>(
      s,
      'sincronizaciones',
      {
        select: 'estado,terminada_en,error',
        organizacion_id: `eq.${organizacionId}`,
        tipo: 'eq.publicaciones',
        order: 'iniciada_en.desc',
        limit: '1',
      },
      f,
    ),
  ])

  const publicaciones = filas.flatMap((x): Publicacion[] => {
    const marca = marcaDeCuenta(x.cuenta_meta_id)
    if (!marca) return []
    return [
      {
        id: x.publicacion_id,
        marcaId: marca.id,
        plataforma: x.plataforma,
        tipo: (x.tipo ?? 'imagen') as TipoPublicacion,
        texto: x.texto ?? '',
        permalink: x.permalink,
        publicadoEn: new Date(x.publicado_en),
        vistas: x.vistas ?? 0,
        alcance: x.alcance,
        clics: x.clics,
        meGusta: x.me_gusta ?? 0,
        comentarios: x.comentarios ?? 0,
        compartidos: x.compartidos ?? 0,
        guardados: x.guardados ?? 0,
      },
    ]
  })

  const ultima = corridas[0]
  return {
    publicaciones,
    ultimaSync: ultima
      ? { estado: ultima.estado, terminadaEn: ultima.terminada_en, error: ultima.error }
      : null,
  }
}
