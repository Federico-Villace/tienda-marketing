/**
 * Qué pisaría un cambio "para todas" de la tanda. Si las piezas tienen valores propios distintos (una línea
 * extra por texto, otro fondo en una), aplicar a todas los reemplaza: antes de hacerlo se muestra la lista
 * y la persona confirma. Si todas tenían lo mismo, es una edición normal y no hay nada que avisar.
 */

import type { Diseno } from '../diseno/tipos.ts'

type CampoComparable = 'lineaExtra' | 'fondoDescripcion' | 'inspiracionFotoId' | 'fondo' | 'plantilla' | 'posicionMoto' | 'diseno'
/** `ocultos` (los textos sacados de la placa) vive dentro del diseño de cada pieza: tiene su propia función, `ocultosQueSePisan`. */
export type CampoDeLote = CampoComparable | 'ocultos'
export const CAMPOS_DE_LOTE: readonly CampoComparable[] = ['lineaExtra', 'fondoDescripcion', 'inspiracionFotoId', 'fondo', 'plantilla', 'posicionMoto', 'diseno']

/** El diseño de una pieza es un objeto (o null): para compararlo y mostrarlo se pasa a texto. */
type Valor = string | Diseno | null | undefined
export type PiezaComparable = { id: string } & Record<Exclude<CampoComparable, 'diseno'>, string | null> & { diseno?: Diseno | null }
export type Reemplazo = { pieza: string; campo: CampoDeLote; antes: string }

const comoTexto = (v: Valor): string | null => (v === undefined || v === null ? null : typeof v === 'string' ? v : JSON.stringify(v))

export function loQueSeReemplaza(
  piezas: readonly PiezaComparable[],
  propuesta: Partial<Record<Exclude<CampoComparable, 'diseno'>, string | null>> & { diseno?: Diseno | null },
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
  // La copia fiel (ADR-040) es una elección explícita de la pieza: pasar a otra plantilla la pierde, aunque TODAS la tuvieran.
  if ('plantilla' in propuesta && propuesta.plantilla !== 'copia_fiel') {
    for (const p of piezas) {
      const nombre = nombreDe(p)
      if (p.plantilla === 'copia_fiel' && !lista.some((r) => r.pieza === nombre && r.campo === 'plantilla')) lista.push({ pieza: nombre, campo: 'plantilla', antes: 'copia_fiel' })
    }
  }
  return lista
}

/**
 * Los textos sacados de la placa (`diseno.ocultos`) que "aplicar a todas" pisaría: como cualquier campo de lote, solo se avisa si las piezas
 * tenían cosas distintas entre sí. null o vacío = no sacó nada (nada que perder).
 */
export function ocultosQueSePisan(
  piezas: readonly { id: string; ocultos: readonly string[] | null }[],
  propuesta: readonly string[],
  nombreDe: (p: { id: string }) => string,
): Reemplazo[] {
  const texto = (o: readonly string[] | null) => (o && o.length > 0 ? [...o].sort().join(', ') : null)
  const valores = piezas.map((p) => texto(p.ocultos))
  if (valores.every((v) => v === valores[0])) return []
  const nuevo = texto(propuesta)
  return piezas.flatMap((p, i) => (valores[i] !== null && valores[i] !== nuevo ? [{ pieza: nombreDe(p), campo: 'ocultos' as const, antes: valores[i]! }] : []))
}
