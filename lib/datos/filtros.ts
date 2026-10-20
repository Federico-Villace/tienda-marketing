/**
 * Filtros del tablero: un solo módulo que comparten /tablero y /api/analisis,
 * así el análisis ve exactamente lo que hay en pantalla.
 *
 * Todo lo que llega por la URL es entrada no confiable: se valida y se recorta
 * a la ventana de 90 días. Nunca lanza; lo inválido vuelve al valor por defecto.
 */

import { rangoDias } from '../ingesta/transformar.ts'
import { MARCAS } from './marcas.ts'
import type { Plataforma, Publicacion } from './tipos.ts'

export type PlataformaFiltro = Plataforma | 'todas'

export type Filtros = {
  readonly marcaId: string
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

export function parsearFiltros(
  p: Partial<Record<'marca' | 'plataforma' | 'desde' | 'hasta', string>>,
  hoy: Date,
): Filtros {
  const { desde: min, hasta: max } = rangoDias(hoy, VENTANA_DIAS)
  const a = recortar(p.desde, min, max, min)
  const b = recortar(p.hasta, min, max, max)

  return {
    marcaId: MARCAS.find((m) => m.id === p.marca)?.id ?? MARCAS[0]!.id,
    plataforma: p.plataforma === 'instagram' || p.plataforma === 'facebook' ? p.plataforma : 'todas',
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
      p.marcaId === f.marcaId &&
      (f.plataforma === 'todas' || p.plataforma === f.plataforma) &&
      t >= inicio &&
      t < fin
    )
  })
}

/** Link al tablero con los filtros actuales, cambiando solo lo pedido. */
export function hrefTablero(f: Filtros, cambios: Partial<Filtros>): string {
  const n = { ...f, ...cambios }
  const q = new URLSearchParams({ marca: n.marcaId, plataforma: n.plataforma, desde: n.desde, hasta: n.hasta })
  return `/tablero?${q.toString()}`
}
