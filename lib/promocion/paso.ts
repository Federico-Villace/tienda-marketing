/**
 * El paso en el que está una promoción se DERIVA de lo que ya tiene cargado; no
 * se guarda. Así nunca hay un estado inconsistente (una columna que diga "4" sin
 * que exista la escena).
 *
 *   1 qué promocionás · 2 cómo nos fue · 3 textos · 4 imagen · 5 aprobar · 6 listo
 *
 * El paso 2 se puede saltear: si ya se pidieron textos o hay análisis, el actual es el 3.
 */

import type { PromocionVista } from './tipos.ts'

export type EntradaPaso = Pick<PromocionVista, 'estado' | 'analisisId' | 'textosId' | 'copy' | 'plantilla' | 'escenaCreativoId' | 'placaLista'>

export function pasoActual(p: EntradaPaso): number {
  if (p.estado === 'descartada') return 1
  if (p.estado === 'aprobada') return 6
  if (!p.copy) return p.analisisId || p.textosId ? 3 : 2
  if (!p.escenaCreativoId || !p.plantilla || !p.placaLista) return 4
  return 5
}

/** A qué pasos se puede ir: hasta el actual, y el 3 aunque el 2 no se haya hecho. */
export function pasosAlcanzados(p: EntradaPaso): number[] {
  const actual = pasoActual(p)
  const hasta = actual === 2 ? 3 : actual
  return Array.from({ length: hasta }, (_, i) => i + 1)
}
