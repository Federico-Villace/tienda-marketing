/**
 * Lectura de las pantallas de /promocionar. La hace el servidor desde page.tsx; el
 * cliente recibe URLs firmadas de vida corta (nunca una ruta ni la organización) y,
 * después de actuar, hace router.refresh(): una sola fuente de verdad.
 */

import { UUID } from '../agentes/http.ts'
import { COLUMNAS_ANALISIS, leerEdiciones, vistaDeFila, type AnalisisVista, type FilaAnalisis } from '../analista/historial.ts'
import { MARCAS } from '../datos/marcas.ts'
import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import {
  firmar,
  SELECT_CREATIVO,
  SELECT_GEN,
  vistaCreativo,
  vistaGeneracion,
  type CreativoVista,
  type FilaCreativo,
  type FilaGeneracion,
  type GeneracionVista,
} from '../productor/pantalla.ts'
import { rpc, seleccionar, type Supabase } from '../supabase/rest.ts'
import { formatearPrecio, hashDatos } from './datos.ts'
import { marcaPorId } from './marca.ts'
import { firmarPlaca } from './placa.ts'
import { esTipoTanda, type TipoTanda } from './lote/tipos.ts'
import { escenaEsDe } from './tanda/escena.ts'
import { COLUMNAS_PROMOCION, type CopyPromo, type FilaPromocion, type PromocionVista } from './tipos.ts'
import { vistaDePromocion } from './vista.ts'

type Fetch = typeof fetch

const MAX_LISTA = 200
const MAX_FOTOS = 20

export type ItemLista = {
  id: string
  estado: PromocionVista['estado']
  marca: string
  /** Para filtrar la lista (el mismo id que usa /tablero). */
  marcaId: string
  modelo: string
  /** "$ 4.500.000". */
  precio: string
  pasoActual: number
  /** Null = suelta; si no, la tanda de la que es hija. */
  tandaId: string | null
  /** Qué tipo de tanda es (null = suelta). Las anteriores a los lotes son 'marcas'. */
  tipoTanda: TipoTanda | null
  /** Lote de motos: qué moto es; lote de textos: qué variante. */
  grupo: number | null
  variante: number | null
  actualizadoEn: string
  /** La placa (aprobadas) o la foto (borradores); null si no se pudo firmar. */
  miniatura: string | null
  /** Solo aprobadas: URL que baja el PNG con nombre. */
  descarga: string | null
}

export type FotoDePromocion = { id: string; ancho: number; alto: number; creadoEn: string; url: string | null }

export type DetallePromocion = {
  promocion: PromocionVista
  marca: { id: string; nombre: string; usuarioIg: string }
  foto: { id: string; ancho: number; alto: number; url: string | null; borrada: boolean } | null
  /** La foto de inspiración (estilo, luz, ambiente), si la hay. */
  inspiracion: { id: string; url: string | null; borrada: boolean } | null
  analisis: AnalisisVista | null
  textos: { id: string; opciones: CopyPromo[]; intento: number; costoUsd: number; desactualizado: boolean } | null
  escenas: { generacion: GeneracionVista; creativos: (CreativoVista & { esLaElegida: boolean })[] }[]
  placa: { url: string | null; descarga: string | null } | null
  aprobaciones: { id: string; version: number; aprobadoEn: string; aprobadoPor: string }[]
  /**
   * Si es hija de una tanda: cuál, cuántas hermanas vivas (ella incluida) y cuáles de las OTRAS
   * siguen en borrador y son de su misma moto (a esas se les puede aplicar la misma imagen).
   */
  tanda: { id: string; total: number; hermanas: { id: string; revision: number }[] } | null
  gastadoUsd: number
}

/** "TRK 502" + "4:5" → "trk-502-4x5.png". */
export const nombreDeDescarga = (modelo: string, aspecto: string): string =>
  `${modelo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'promocion'}-${aspecto.replace(':', 'x')}.png`

const BUCKET_FOTOS = 'fotos'
const BUCKET_CREATIVOS = 'creativos'

/**
 * Trae las últimas MAX_LISTA promociones (borrador, aprobada, descartada). Filtrar, agrupar las tandas y
 * paginar lo hace lista-vista.ts: el filtro por modelo ignora tildes y espacios y una tanda no se puede
 * cortar entre páginas, cosa que limit/offset en PostgREST no resuelve (ADR-031). `elegir` dice cuáles
 * se van a ver: solo a esas se les firma miniatura y descarga.
 */
export async function leerListaPromociones(
  s: Supabase,
  f: Fetch,
  elegir?: (l: { borradores: ItemLista[]; aprobadas: ItemLista[]; descartadas: ItemLista[] }) => ItemLista[],
): Promise<{ borradores: ItemLista[]; aprobadas: ItemLista[]; descartadas: ItemLista[]; truncada: boolean }> {
  const filas = await seleccionar<FilaPromocion & { tandas_promocion?: { tipo?: string } | null }>(
    s,
    'promociones',
    {
      select: `${COLUMNAS_PROMOCION},tandas_promocion(tipo)`,
      organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`,
      estado: 'in.(borrador,aprobada,descartada)',
      order: 'actualizado_en.desc',
      limit: String(MAX_LISTA),
    },
    f,
  )
  const truncada = filas.length >= MAX_LISTA

  const items = filas.map(
    (p): ItemLista => ({
      id: p.id,
      estado: p.estado,
      marca: marcaPorId(p.marca_id)?.nombre ?? '',
      marcaId: p.marca_id,
      modelo: p.modelo,
      precio: formatearPrecio(p.datos.precio),
      pasoActual: vistaDePromocion(p).pasoActual,
      tandaId: p.tanda_id,
      tipoTanda: p.tanda_id === null ? null : esTipoTanda(p.tandas_promocion?.tipo) ? p.tandas_promocion.tipo : 'marcas',
      grupo: p.grupo ?? null,
      variante: p.variante ?? null,
      actualizadoEn: p.actualizado_en,
      miniatura: null,
      descarga: null,
    }),
  )
  const listas = {
    borradores: items.filter((x) => x.estado === 'borrador'),
    aprobadas: items.filter((x) => x.estado === 'aprobada'),
    descartadas: items.filter((x) => x.estado === 'descartada'),
  }
  if (filas.length === 0) return { ...listas, truncada }

  const visibles = new Set((elegir ? elegir(listas) : items).map((x) => x.id))
  const mostradas = filas.filter((p) => visibles.has(p.id))
  const itemPorId = new Map(items.map((x) => [x.id, x]))

  const fotoIds = [...new Set(mostradas.filter((p) => p.estado !== 'aprobada').map((p) => p.foto_id))]
  const fotos = fotoIds.length
    ? await seleccionar<{ id: string; ruta: string | null }>(
        s,
        'fotos',
        { select: 'id,ruta', organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, id: `in.(${fotoIds.join(',')})` },
        f,
      )
    : []
  const rutaFoto = new Map(fotos.map((x) => [x.id, x.ruta]))
  const rutasPlaca = mostradas.flatMap((p) => (p.estado === 'aprobada' && p.placa_ruta ? [p.placa_ruta] : []))
  const rutasFoto = fotos.flatMap((x) => (x.ruta ? [x.ruta] : []))
  const [urlsPlaca, urlsFoto, descargas] = await Promise.all([
    firmar(s, BUCKET_CREATIVOS, rutasPlaca, f),
    firmar(s, BUCKET_FOTOS, rutasFoto, f),
    Promise.all(mostradas.map((p) => (p.estado === 'aprobada' && p.placa_ruta ? firmarPlaca(s, p.placa_ruta, f, nombreDeDescarga(p.modelo, p.aspecto)) : null))),
  ])

  mostradas.forEach((p, i) => {
    const x = itemPorId.get(p.id)!
    const fotoRuta = rutaFoto.get(p.foto_id)
    x.miniatura = p.estado === 'aprobada' ? (p.placa_ruta ? (urlsPlaca.get(p.placa_ruta) ?? null) : null) : fotoRuta ? (urlsFoto.get(fotoRuta) ?? null) : null
    x.descarga = descargas[i] ?? null
  })
  return { ...listas, truncada }
}

/** Las fotos recientes (no borradas) para elegir en el paso 1. La ruta se queda en el servidor. */
export async function leerFotosParaPromocion(s: Supabase, f: Fetch): Promise<FotoDePromocion[]> {
  const fotos = await seleccionar<{ id: string; ruta: string | null; ancho: number; alto: number; creado_en: string }>(
    s,
    'fotos',
    {
      select: 'id,ruta,ancho,alto,creado_en',
      organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`,
      uso: 'eq.moto',
      borrada_en: 'is.null',
      order: 'creado_en.desc',
      limit: String(MAX_FOTOS),
    },
    f,
  )
  const urls = await firmar(s, BUCKET_FOTOS, fotos.flatMap((x) => (x.ruta ? [x.ruta] : [])), f)
  return fotos.map((x) => ({ id: x.id, ancho: x.ancho, alto: x.alto, creadoEn: x.creado_en, url: x.ruta ? (urls.get(x.ruta) ?? null) : null }))
}

export async function leerDetallePromocion(s: Supabase, id: string, f: Fetch, ahora: () => number = Date.now): Promise<DetallePromocion | null> {
  if (!UUID.test(id)) return null
  const [fila] = await seleccionar<FilaPromocion>(
    s,
    'promociones',
    { select: COLUMNAS_PROMOCION, id: `eq.${id}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
    f,
  )
  if (!fila) return null

  const org = { organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}` }
  const [fotos, analisis, textos, todasLasGens, aprobaciones, gasto, hermanas] = await Promise.all([
    seleccionar<{ id: string; ruta: string | null; ancho: number; alto: number; borrada_en: string | null }>(
      s,
      'fotos',
      { select: 'id,ruta,ancho,alto,borrada_en', ...org, id: `in.(${[fila.foto_id, fila.inspiracion_foto_id].filter(Boolean).join(',')})` },
      f,
    ),
    fila.analisis_id
      ? seleccionar<FilaAnalisis>(s, 'analisis', { select: COLUMNAS_ANALISIS, ...org, id: `eq.${fila.analisis_id}`, limit: '1' }, f)
      : Promise.resolve([] as FilaAnalisis[]),
    fila.textos_id
      ? seleccionar<{ id: string; opciones: CopyPromo[]; intento: number; costo_usd: number | string; datos_hash: string }>(
          s,
          'textos_promocion',
          { select: 'id,promocion_id,intento,opciones,costo_usd,datos_hash,creado_en', ...org, id: `eq.${fila.textos_id}`, limit: '1' },
          f,
        )
      : Promise.resolve([]),
    seleccionar<FilaGeneracion>(
      s,
      'generaciones',
      {
        select: `${SELECT_GEN},promocion_id,tanda_id,grupo`,
        ...org,
        // Una hija también ve la escena compartida de su tanda.
        ...(fila.tanda_id ? { or: `(promocion_id.eq.${id},tanda_id.eq.${fila.tanda_id})` } : { promocion_id: `eq.${id}` }),
        estado: 'neq.estimada',
        order: 'creado_en.desc',
      },
      f,
    ),
    seleccionar<{ id: string; version: number; aprobado_en: string; aprobado_por: string }>(
      s,
      'aprobaciones_promocion',
      { select: 'id,version,aprobado_en,aprobado_por', ...org, promocion_id: `eq.${id}`, order: 'version.desc' },
      f,
    ),
    rpc<number>(s, 'gasto_generaciones_mes', { p_org: ORGANIZACION_PILOTO_ID }, f),
    fila.tanda_id
      ? seleccionar<{ id: string; revision?: number; estado?: string; grupo?: number | null }>(
          s,
          'promociones',
          { select: 'id,revision,estado,grupo', ...org, tanda_id: `eq.${fila.tanda_id}`, estado: 'neq.descartada' },
          f,
        )
      : Promise.resolve([] as { id: string; revision?: number; estado?: string; grupo?: number | null }[]),
  ])

  // En un lote de motos la hija ve solo las escenas de SU moto (las de las otras no le sirven).
  const gens = fila.grupo != null ? todasLasGens.filter((g) => escenaEsDe({ promocion_id: g.promocion_id ?? null, tanda_id: g.tanda_id, grupo: g.grupo }, fila)) : todasLasGens
  const creativos = gens.length
    ? await seleccionar<FilaCreativo>(
        s,
        'creativos',
        { select: SELECT_CREATIVO, ...org, generacion_id: `in.(${gens.map((g) => g.id).join(',')})`, order: 'creado_en.desc,orden.asc' },
        f,
      )
    : []
  const foto = fotos.find((x) => x.id === fila.foto_id)
  const inspiracion = fotos.find((x) => x.id === fila.inspiracion_foto_id)
  const [urlsCreativos, urlsFoto, vistaAnalisis] = await Promise.all([
    firmar(s, BUCKET_CREATIVOS, creativos.flatMap((c) => (c.ruta ? [c.ruta] : [])), f),
    firmar(s, BUCKET_FOTOS, [foto?.ruta, inspiracion?.ruta].flatMap((r) => (r ? [r] : [])), f),
    analisis[0] ? leerEdiciones(s, [analisis[0].id], f).then((e) => vistaDeFila(analisis[0]!, false, e)) : Promise.resolve(null),
  ])
  const placa = fila.placa_ruta
    ? {
        url: await firmarPlaca(s, fila.placa_ruta, f),
        descarga: await firmarPlaca(s, fila.placa_ruta, f, nombreDeDescarga(fila.modelo, fila.aspecto)),
      }
    : null

  const marca = marcaPorId(fila.marca_id) ?? MARCAS[0]!
  const ahoraMs = ahora()
  const t = textos[0]
  return {
    promocion: vistaDePromocion(fila),
    marca: { id: marca.id, nombre: marca.nombre, usuarioIg: marca.usuarioIg },
    foto: foto
      ? { id: foto.id, ancho: foto.ancho, alto: foto.alto, borrada: foto.borrada_en !== null, url: foto.ruta ? (urlsFoto.get(foto.ruta) ?? null) : null }
      : null,
    inspiracion: inspiracion ? { id: inspiracion.id, borrada: inspiracion.borrada_en !== null, url: inspiracion.ruta ? (urlsFoto.get(inspiracion.ruta) ?? null) : null } : null,
    analisis: vistaAnalisis,
    textos: t
      ? { id: t.id, opciones: t.opciones, intento: t.intento, costoUsd: Number(t.costo_usd), desactualizado: t.datos_hash !== hashDatos(fila.datos) }
      : null,
    escenas: gens.map((g) => ({
      generacion: vistaGeneracion(g, ahoraMs),
      creativos: creativos
        .filter((c) => c.generacion_id === g.id)
        .map((c) => ({ ...vistaCreativo(c, urlsCreativos), esLaElegida: c.id === fila.escena_creativo_id, elegida: c.id === fila.escena_creativo_id })),
    })),
    placa,
    aprobaciones: aprobaciones.map((a) => ({ id: a.id, version: a.version, aprobadoEn: a.aprobado_en, aprobadoPor: a.aprobado_por })),
    tanda: fila.tanda_id
      ? {
          id: fila.tanda_id,
          total: hermanas.length,
          hermanas: hermanas
            .filter((h) => h.id !== fila.id && h.estado === 'borrador' && (h.grupo ?? null) === (fila.grupo ?? null))
            .map((h) => ({ id: h.id, revision: h.revision ?? 1 })),
        }
      : null,
    gastadoUsd: Math.round((Number(gasto) || 0) * 1e6) / 1e6,
  }
}
