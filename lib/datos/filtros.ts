/**
 * Filtros del tablero: un solo módulo que comparten /tablero y /api/analisis,
 * así el análisis ve exactamente lo que hay en pantalla.
 *
 * Todo lo que llega por la URL es entrada no confiable: se valida y se recorta
 * a la ventana de 90 días. Nunca lanza; lo inválido vuelve al valor por defecto.
 */

import { rangoDias } from '../ingesta/transformar.ts'
import { MARCAS, ordenarMarcas } from './marcas.ts'
import type { Plataforma, Publicacion } from './tipos.ts'

export type PlataformaFiltro = Plataforma | 'todas'

export type Filtros = {
  /** Ids de marca (página de FB), siempre en el orden de MARCAS y nunca vacío. */
  readonly marcaIds: readonly string[]
  readonly plataforma: PlataformaFiltro
  /** YYYY-MM-DD, hora de Argentina. */
  readonly desde: string
  readonly hasta: string
}

export const VENTANA_DIAS = 90

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const OFFSET_AR_MS = 3 * 60 * 60 * 1000

/** Fecha real del calendario (descarta 2026-02-31) con forma YYYY-MM-DD. */
const esFechaValida = (v: string | undefined): v is string => {
  if (!v || !FECHA.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

const recortar = (v: string | undefined, min: string, max: string, porDefecto: string): string => {
  if (!esFechaValida(v)) return porDefecto
  return v < min ? min : v > max ? max : v
}

/** Lo que llega de la URL: un valor, varios (clave repetida) o nada. */
export type ParamUrl = string | readonly string[] | undefined

const lista = (v: ParamUrl): readonly string[] => (v === undefined ? [] : typeof v === 'string' ? [v] : v)
const primero = (v: ParamUrl): string | undefined => lista(v)[0]

const TODAS_LAS_MARCAS = (): string[] => MARCAS.map((m) => m.id)
const MARCA_POR_DEFECTO = (): string[] => [MARCAS[0]!.id]

function parsearMarcas(v: ParamUrl): string[] {
  const l = lista(v)
  if (l.includes('todas')) return TODAS_LAS_MARCAS()
  const validas = ordenarMarcas(l)
  return validas.length > 0 ? validas : MARCA_POR_DEFECTO()
}

/**
 * Marcas de un parámetro de URL, SIN default: lo inválido se ignora y puede quedar vacío
 * (la pantalla que lo usa decide qué hacer). `todas` son las 7.
 */
export function marcasDeUrl(v: ParamUrl): string[] {
  const l = lista(v)
  return l.includes('todas') ? TODAS_LAS_MARCAS() : ordenarMarcas(l)
}

/** El valor de `marca` en una URL: `todas` si son las 7; si no, la lista (clave repetida). */
export const paramsMarcas = (marcaIds: readonly string[]): [string, string][] => {
  const ids = ordenarMarcas(marcaIds)
  return ids.length === MARCAS.length ? [['marca', 'todas']] : ids.map((id) => ['marca', id])
}

function parsearPlataforma(v: ParamUrl): PlataformaFiltro {
  const l = lista(v)
  const ig = l.includes('instagram')
  const fb = l.includes('facebook')
  return ig && !fb ? 'instagram' : fb && !ig ? 'facebook' : 'todas'
}

export function parsearFiltros(
  p: Partial<Record<'marca' | 'plataforma' | 'desde' | 'hasta', ParamUrl>>,
  hoy: Date,
): Filtros {
  const { desde: min, hasta: max } = rangoDias(hoy, VENTANA_DIAS)
  const a = recortar(primero(p.desde), min, max, min)
  const b = recortar(primero(p.hasta), min, max, max)

  return {
    marcaIds: parsearMarcas(p.marca),
    plataforma: parsearPlataforma(p.plataforma),
    desde: a <= b ? a : b,
    hasta: a <= b ? b : a,
  }
}

/** Instante en que arranca `fecha` (YYYY-MM-DD) en hora de Argentina. */
const inicioDiaAR = (fecha: string): number => Date.parse(`${fecha}T00:00:00Z`) + OFFSET_AR_MS

const DIA_MS = 24 * 60 * 60 * 1000

/** Marca + plataforma + fechas (inclusive ambos extremos, en hora de Argentina). */
export function filtrarPublicaciones(ps: readonly Publicacion[], f: Filtros): Publicacion[] {
  const inicio = inicioDiaAR(f.desde)
  const fin = inicioDiaAR(f.hasta) + DIA_MS
  return ps.filter((p) => {
    const t = p.publicadoEn.getTime()
    return (
      f.marcaIds.includes(p.marcaId) &&
      (f.plataforma === 'todas' || p.plataforma === f.plataforma) &&
      t >= inicio &&
      t < fin
    )
  })
}

/**
 * Los pares clave/valor de la URL. Las 7 marcas viajan como `marca=todas` (corto);
 * si no, `marca` repetido en el orden de MARCAS. Es lo mismo que serializa un form GET.
 */
export function paramsFiltros(f: Filtros): [string, string][] {
  return [...paramsMarcas(f.marcaIds), ['plataforma', f.plataforma], ['desde', f.desde], ['hasta', f.hasta]]
}

/** Link al tablero con los filtros actuales, cambiando solo lo pedido. */
export function hrefTablero(f: Filtros, cambios: Partial<Filtros>): string {
  const q = new URLSearchParams()
  for (const [k, v] of paramsFiltros({ ...f, ...cambios })) q.append(k, v)
  return `/tablero?${q.toString()}`
}

/**
 * Filtros guardados en `analisis.filtros` (jsonb). Las filas viejas traen un
 * `marcaId`; las nuevas, `marcaIds`. Devuelve null si no se puede leer.
 */
export function normalizarFiltrosGuardados(x: unknown): Filtros | null {
  if (typeof x !== 'object' || x === null) return null
  const o = x as Record<string, unknown>
  const crudas = Array.isArray(o.marcaIds) ? o.marcaIds : [o.marcaId]
  const marcaIds = ordenarMarcas(crudas.filter((m): m is string => typeof m === 'string'))
  if (marcaIds.length === 0 || typeof o.desde !== 'string' || typeof o.hasta !== 'string') return null
  return { marcaIds, plataforma: parsearPlataforma(typeof o.plataforma === 'string' ? o.plataforma : undefined), desde: o.desde, hasta: o.hasta }
}
