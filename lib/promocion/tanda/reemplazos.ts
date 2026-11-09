/**
 * Qué pisaría un cambio "para todas" de la tanda. Si las piezas tienen valores propios distintos (una línea
 * extra por texto, otro fondo en una), aplicar a todas los reemplaza: antes de hacerlo se muestra la lista
 * y la persona confirma. Si todas tenían lo mismo, es una edición normal y no hay nada que avisar.
 */

import type { Diseno } from '../diseno/tipos.ts'

export type CampoDeLote = 'lineaExtra' | 'fondoDescripcion' | 'inspiracionFotoId' | 'fondo' | 'plantilla' | 'posicionMoto' | 'diseno'
export const CAMPOS_DE_LOTE: readonly CampoDeLote[] = ['lineaExtra', 'fondoDescripcion', 'inspiracionFotoId', 'fondo', 'plantilla', 'posicionMoto', 'diseno']

/** El diseño de una pieza es un objeto (o null): para compararlo y mostrarlo se pasa a texto. */
type Valor = string | Diseno | null | undefined
export type PiezaComparable = { id: string } & Record<Exclude<CampoDeLote, 'diseno'>, string | null> & { diseno?: Diseno | null }
export type Reemplazo = { pieza: string; campo: CampoDeLote; antes: string }

const comoTexto = (v: Valor): string | null => (v === undefined || v === null ? null : typeof v === 'string' ? v : JSON.stringify(v))

export function loQueSeReemplaza(
  piezas: readonly PiezaComparable[],
  propuesta: Partial<Record<Exclude<CampoDeLote, 'diseno'>, string | null>> & { diseno?: Diseno | null },
  nombreDe: (p: { id: string }) => string,
): Reemplazo[] {
  const lista: Reemplazo[] = []
  for (const campo of CAMPOS_DE_LOTE) {
    if (!(campo in propuesta)) continue
    const valores = piezas.map((p) => comoTexto(p[campo]))
    if (valores.every((v) => v === valores[0])) continue
    for (const p of piezas) {
      const antes = comoTexto(p[campo])
      if (antes !== null && antes !== comoTexto(propuesta[campo])) lista.push({ pieza: nombreDe(p), campo, antes })
    }
  }
  return lista
}
