/**
 * Lectura de la pantalla /creativos. La hace el servidor desde page.tsx; el
 * cliente recibe URLs firmadas de vida corta (nunca base64, nunca una ruta) y,
 * después de actuar, hace router.refresh().
 */

import type { Pieza } from '../contenidista/tipos.ts'
import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { ErrorSupabase, rpc, seleccionar, type Supabase } from '../supabase/rest.ts'
import { firmarUrls } from '../supabase/storage.ts'
import { aspectoDe } from './prompt.ts'

type Fetch = typeof fetch

const MAX_PIEZAS = 50
const VIGENCIA_URL_S = 3600
const INTERRUMPIDA_MS = 10 * 60_000

export type CreativoVista = {
  id: string
  generacionId: string
  orden: number
  url: string | null
  ancho: number | null
  alto: number | null
  costoUsd: number
  error: string | null
  elegida: boolean
}

export type GeneracionVista = {
  id: string
  estado: string
  motor: string
  cantidad: number
  costoEstimadoUsd: number
  costoRealUsd: number | null
  error: string | null
  creadoEn: string
  /** Quedó confirmada o corriendo hace más de 10 minutos: la función murió a mitad. */
  interrumpida: boolean
}

export type PiezaImagenVista = {
  id: string
  raizId: string
  version: number
  aprobadoEn: string | null
  pieza: Pieza
  aspecto: string
  generaciones: GeneracionVista[]
  creativos: CreativoVista[]
}

export type PantallaProductor = { piezas: PiezaImagenVista[]; gastadoUsd: number }

type FilaPieza = { id: string; raiz_id: string; version: number; aprobado_en: string | null; pieza: Pieza }
type FilaGeneracion = {
  id: string
  pieza_raiz_id: string
  estado: string
  motor: string
  cantidad: number
  costo_estimado_usd: number | string
  costo_real_usd: number | string | null
  error: string | null
  creado_en: string
  confirmada_en: string | null
}
type FilaCreativo = {
  id: string
  generacion_id: string
  pieza_raiz_id: string
  orden: number
  ruta: string | null
  ancho: number | null
  alto: number | null
  costo_usd: number | string
  error: string | null
  elegida: boolean
}

export async function leerPantallaProductor(s: Supabase, f: Fetch, ahora: () => number = Date.now): Promise<PantallaProductor> {
  const [piezas, gasto] = await Promise.all([
    seleccionar<FilaPieza>(
      s,
      'piezas',
      {
        select: 'id,raiz_id,version,aprobado_en,pieza',
        organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`,
        estado: 'eq.aprobada',
        'pieza->>formato': 'in.(imagen,carrusel,historia)',
        order: 'aprobado_en.desc',
        limit: String(MAX_PIEZAS),
      },
      f,
    ),
    rpc<number>(s, 'gasto_generaciones_mes', { p_org: ORGANIZACION_PILOTO_ID }, f),
  ])
  const gastadoUsd = Math.round((Number(gasto) || 0) * 1e6) / 1e6
  if (piezas.length === 0) return { piezas: [], gastadoUsd }

  const raices = `in.(${piezas.map((p) => p.raiz_id).join(',')})`
  const [gens, creativos] = await Promise.all([
    seleccionar<FilaGeneracion>(
      s,
      'generaciones',
      {
        select: 'id,pieza_raiz_id,estado,motor,cantidad,costo_estimado_usd,costo_real_usd,error,creado_en,confirmada_en',
        organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`,
        pieza_raiz_id: raices,
        estado: 'neq.estimada',
        order: 'creado_en.desc',
      },
      f,
    ),
    seleccionar<FilaCreativo>(
      s,
      'creativos',
      {
        select: 'id,generacion_id,pieza_raiz_id,orden,ruta,ancho,alto,costo_usd,error,elegida',
        organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`,
        pieza_raiz_id: raices,
        order: 'creado_en.desc,orden.asc',
      },
      f,
    ),
  ])

  // Si el firmado falla las imágenes siguen listadas, sin URL.
  let urls = new Map<string, string>()
  try {
    urls = await firmarUrls(s, 'creativos', creativos.flatMap((c) => (c.ruta ? [c.ruta] : [])), VIGENCIA_URL_S, f)
  } catch (e) {
    console.error('creativos: no se pudo firmar', e instanceof ErrorSupabase ? e.message : 'error interno')
  }

  const ahoraMs = ahora()
  return {
    gastadoUsd,
    piezas: piezas.map((p) => ({
      id: p.id,
      raizId: p.raiz_id,
      version: p.version,
      aprobadoEn: p.aprobado_en,
      pieza: p.pieza,
      aspecto: aspectoDe(p.pieza.formato, p.pieza.plataforma) ?? '',
      generaciones: gens
        .filter((g) => g.pieza_raiz_id === p.raiz_id)
        .map((g) => ({
          id: g.id,
          estado: g.estado,
          motor: g.motor,
          cantidad: g.cantidad,
          costoEstimadoUsd: Number(g.costo_estimado_usd),
          costoRealUsd: g.costo_real_usd === null ? null : Number(g.costo_real_usd),
          error: g.error,
          creadoEn: g.creado_en,
          interrumpida:
            (g.estado === 'confirmada' || g.estado === 'corriendo') &&
            g.confirmada_en !== null &&
            ahoraMs - Date.parse(g.confirmada_en) > INTERRUMPIDA_MS,
        })),
      creativos: creativos
        .filter((c) => c.pieza_raiz_id === p.raiz_id)
        .map((c) => ({
          id: c.id,
          generacionId: c.generacion_id,
          orden: c.orden,
          url: c.ruta ? (urls.get(c.ruta) ?? null) : null,
          ancho: c.ancho,
          alto: c.alto,
          costoUsd: Number(c.costo_usd),
          error: c.error,
          elegida: c.elegida,
        })),
    })),
  }
}
