/**
 * Las versiones del texto de una promoción a partir de la conversación (ADR-034): "Original" (el texto
 * antes del primer cambio pedido) y "Cambio 1..N" (lo que quedó después de cada uno). "Usar esta" es un
 * PATCH de copy que ya existe: no hay tabla de versiones, el original queda en el turno 1.
 */

import { hashJson } from '../../agentes/hash.ts'
import type { TurnoVista } from '../../agentes/conversacion/tipos.ts'
import type { CopyPromo } from '../tipos.ts'

export type VersionTexto = {
  /** "original" o "t3": estable para las keys y los botones. */
  clave: string
  etiqueta: string
  /** Qué se pidió para llegar a esta versión; null en el original. */
  pedido: string | null
  copy: CopyPromo
  /** Es el texto que tiene hoy la promoción. */
  actual: boolean
}

const esCopy = (x: unknown): x is CopyPromo => typeof x === 'object' && x !== null && typeof (x as CopyPromo).titular === 'string' && typeof (x as CopyPromo).copy === 'string'

export function versionesDeTexto(turnos: readonly TurnoVista[], copyActual: CopyPromo | null): VersionTexto[] {
  const ok = turnos.filter((t) => t.estado === 'ok' && esCopy(t.respuesta?.despues) && esCopy(t.respuesta?.antes)).sort((a, b) => a.turno - b.turno)
  if (ok.length === 0) return []
  const esActual = (c: CopyPromo) => copyActual !== null && hashJson(c) === hashJson(copyActual)
  const original = ok[0]!.respuesta!.antes as CopyPromo
  return [
    { clave: 'original', etiqueta: 'Original', pedido: null, copy: original, actual: esActual(original) },
    ...ok.map((t, i) => {
      const copy = t.respuesta!.despues as CopyPromo
      return { clave: `t${t.turno}`, etiqueta: `Cambio ${i + 1}`, pedido: t.pedido, copy, actual: esActual(copy) }
    }),
  ]
}
