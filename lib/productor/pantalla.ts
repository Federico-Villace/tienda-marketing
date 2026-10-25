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
const MAX_FOTOS = 20
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
  /** Id de la edición de foto (ediciones.ts); undefined o null en las de pieza. */
  edicion?: string | null
}

export type FotoVista = {
  id: string
  ancho: number
  alto: number
  creadoEn: string
  /** URL firmada de vida corta; null si no se pudo firmar. */
  url: string | null
  generaciones: GeneracionVista[]
  creativos: CreativoVista[]
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

export type PantallaProductor = { piezas: PiezaImagenVista[]; fotos: FotoVista[]; gastadoUsd: number }

type FilaPieza = { id: string; raiz_id: string; version: number; aprobado_en: string | null; pieza: Pieza }
export type FilaGeneracion = {
  id: string
  pieza_raiz_id: string | null
  foto_id?: string | null
  edicion?: string | null
  estado: string
  motor: string
  cantidad: number
  costo_estimado_usd: number | string
  costo_real_usd: number | string | null
  error: string | null
  creado_en: string
  confirmada_en: string | null
}
type FilaFoto = { id: string; ruta: string | null; ancho: number; alto: number; creado_en: string }
export type FilaCreativo = {
  id: string
  generacion_id: string
  pieza_raiz_id: string | null
  foto_id?: string | null
  orden: number
  ruta: string | null
  ancho: number | null
  alto: number | null
  costo_usd: number | string
  error: string | null
  elegida: boolean
}

export const SELECT_GEN = 'id,pieza_raiz_id,foto_id,edicion,estado,motor,cantidad,costo_estimado_usd,costo_real_usd,error,creado_en,confirmada_en'
export const SELECT_CREATIVO = 'id,generacion_id,pieza_raiz_id,foto_id,orden,ruta,ancho,alto,costo_usd,error,elegida'

export const vistaGeneracion = (g: FilaGeneracion, ahoraMs: number): GeneracionVista => ({
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
  ...(g.edicion ? { edicion: g.edicion } : {}),
})

export const vistaCreativo = (c: FilaCreativo, urls: Map<string, string>): CreativoVista => ({
  id: c.id,
  generacionId: c.generacion_id,
  orden: c.orden,
  url: c.ruta ? (urls.get(c.ruta) ?? null) : null,
  ancho: c.ancho,
  alto: c.alto,
  costoUsd: Number(c.costo_usd),
  error: c.error,
  elegida: c.elegida,
})

/** Si el firmado falla las imágenes siguen listadas, sin URL. */
export async function firmar(s: Supabase, bucket: string, rutas: string[], f: Fetch): Promise<Map<string, string>> {
  try {
    return await firmarUrls(s, bucket, rutas, VIGENCIA_URL_S, f)
  } catch (e) {
    console.error(`${bucket}: no se pudo firmar`, e instanceof ErrorSupabase ? e.message : 'error interno')
    return new Map()
  }
}

export async function leerPantallaProductor(s: Supabase, f: Fetch, ahora: () => number = Date.now): Promise<PantallaProductor> {
  const [piezas, gasto, fotos] = await Promise.all([
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
    // Las fotos recientes no borradas. La ruta se queda en el servidor.
    seleccionar<FilaFoto>(
      s,
      'fotos',
      {
        select: 'id,ruta,ancho,alto,creado_en',
        organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`,
        borrada_en: 'is.null',
        order: 'creado_en.desc',
        limit: String(MAX_FOTOS),
      },
      f,
    ),
  ])
  const gastadoUsd = Math.round((Number(gasto) || 0) * 1e6) / 1e6
  if (piezas.length === 0 && fotos.length === 0) return { piezas: [], fotos: [], gastadoUsd }

  const pedirDe = <T,>(tabla: string, select: string, columna: string, ids: string[], orden: string, extra: Record<string, string> = {}) =>
    ids.length === 0
      ? Promise.resolve([] as T[])
      : seleccionar<T>(
          s,
          tabla,
          { select, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, [columna]: `in.(${ids.join(',')})`, ...extra, order: orden },
          f,
        )
  const raices = piezas.map((p) => p.raiz_id)
  const fotoIds = fotos.map((x) => x.id)
  const noEstimadas = { estado: 'neq.estimada' }
  const [gens, creativos, gensFoto, creativosFoto] = await Promise.all([
    pedirDe<FilaGeneracion>('generaciones', SELECT_GEN, 'pieza_raiz_id', raices, 'creado_en.desc', noEstimadas),
    pedirDe<FilaCreativo>('creativos', SELECT_CREATIVO, 'pieza_raiz_id', raices, 'creado_en.desc,orden.asc'),
    pedirDe<FilaGeneracion>('generaciones', SELECT_GEN, 'foto_id', fotoIds, 'creado_en.desc', noEstimadas),
    pedirDe<FilaCreativo>('creativos', SELECT_CREATIVO, 'foto_id', fotoIds, 'creado_en.desc,orden.asc'),
  ])

  const [urlsCreativos, urlsFotos] = await Promise.all([
    firmar(s, 'creativos', [...creativos, ...creativosFoto].flatMap((c) => (c.ruta ? [c.ruta] : [])), f),
    firmar(s, 'fotos', fotos.flatMap((x) => (x.ruta ? [x.ruta] : [])), f),
  ])

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
      generaciones: gens.filter((g) => g.pieza_raiz_id === p.raiz_id).map((g) => vistaGeneracion(g, ahoraMs)),
      creativos: creativos.filter((c) => c.pieza_raiz_id === p.raiz_id).map((c) => vistaCreativo(c, urlsCreativos)),
    })),
    fotos: fotos.map((x) => ({
      id: x.id,
      ancho: x.ancho,
      alto: x.alto,
      creadoEn: x.creado_en,
      url: x.ruta ? (urlsFotos.get(x.ruta) ?? null) : null,
      generaciones: gensFoto.filter((g) => g.foto_id === x.id).map((g) => vistaGeneracion(g, ahoraMs)),
      creativos: creativosFoto.filter((c) => c.foto_id === x.id).map((c) => vistaCreativo(c, urlsCreativos)),
    })),
  }
}
