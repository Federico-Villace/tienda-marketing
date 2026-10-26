/**
 * Filtros de la lista de /promocionar (ADR-029): marca (el mismo parámetro `marca`
 * que /tablero) y modelo. Sin parámetros no se filtra nada. Entrada no confiable.
 */

import { marcasDeParams, type ParamUrl } from '../datos/filtros.ts'
import { MARCAS, normalizarTexto } from '../datos/marcas.ts'

export const MAX_MODELO = 60

export type FiltrosLista = { readonly marcaIds: readonly string[]; readonly modelo: string }

export function parsearFiltrosLista(p: { marca?: ParamUrl; comparar?: ParamUrl; modelo?: ParamUrl }): FiltrosLista {
  const marcas = marcasDeParams(p)
  const modelo = (typeof p.modelo === 'string' ? p.modelo : (p.modelo?.[0] ?? '')).trim().slice(0, MAX_MODELO)
  return { marcaIds: marcas.length > 0 ? marcas : MARCAS.map((m) => m.id), modelo }
}

/** El modelo "contiene", sin mayúsculas, tildes ni espacios: "trk502" encuentra "TRK 502". */
export function filtrarLista<T extends { marcaId: string; modelo: string }>(items: readonly T[], f: FiltrosLista): T[] {
  const buscado = normalizarTexto(f.modelo)
  return items.filter((x) => f.marcaIds.includes(x.marcaId) && (buscado === '' || normalizarTexto(x.modelo).includes(buscado)))
}
