/**
 * Filtros de /contenido (ADR-029): los mismos parámetros de URL que /tablero
 * (`marca` repetido o `marca=todas`, `plataforma`) más el estado de la pieza.
 * Sin parámetros no se filtra nada. Lo que llega de la URL es entrada no confiable:
 * lo inválido vuelve al valor por defecto y nunca lanza.
 */

import { marcasDeParams, parsearPlataforma, type ParamUrl, type PlataformaFiltro } from '../datos/filtros.ts'
import { MARCAS } from '../datos/marcas.ts'
import type { GrupoPieza } from './pantalla.ts'
import type { EstadoPieza } from './tipos.ts'

/** Los estados que tiene sentido elegir: la punta de una pieza nunca está "reemplazada". */
export const ESTADOS_FILTRABLES = ['borrador', 'aprobada', 'descartada'] as const satisfies readonly EstadoPieza[]
type EstadoFiltrable = (typeof ESTADOS_FILTRABLES)[number]

export type FiltrosContenido = {
  /** Ids de marca en el orden de MARCAS; todas si no se pide ninguna. */
  readonly marcaIds: readonly string[]
  readonly plataforma: PlataformaFiltro
  readonly estados: readonly EstadoFiltrable[]
}

const lista = (v: ParamUrl): readonly string[] => (v === undefined ? [] : typeof v === 'string' ? [v] : v)

export function parsearFiltrosContenido(p: { marca?: ParamUrl; comparar?: ParamUrl; plataforma?: ParamUrl; estado?: ParamUrl }): FiltrosContenido {
  const marcas = marcasDeParams(p)
  const pedidos = lista(p.estado)
  const estados = ESTADOS_FILTRABLES.filter((e) => pedidos.includes(e))
  return {
    marcaIds: marcas.length > 0 ? marcas : MARCAS.map((m) => m.id),
    plataforma: parsearPlataforma(p.plataforma),
    estados: estados.length > 0 ? estados : [...ESTADOS_FILTRABLES],
  }
}

/** Las piezas guardan el NOMBRE de la marca; el filtro maneja ids. */
const idDeMarca = (nombre: string): string | undefined => MARCAS.find((m) => m.nombre === nombre)?.id

export function filtrarGrupos(grupos: readonly GrupoPieza[], f: FiltrosContenido): GrupoPieza[] {
  return grupos.filter((g) => {
    const { pieza, estado } = g.punta
    const marcaId = idDeMarca(pieza.marca)
    return (
      marcaId !== undefined &&
      f.marcaIds.includes(marcaId) &&
      (f.plataforma === 'todas' || pieza.plataforma === f.plataforma) &&
      (f.estados as readonly string[]).includes(estado)
    )
  })
}
