/**
 * Qué pisaría un cambio "para todas" de la tanda. Si las piezas tienen valores propios distintos (una línea
 * extra por texto, otro fondo en una), aplicar a todas los reemplaza: antes de hacerlo se muestra la lista
 * y la persona confirma. Si todas tenían lo mismo, es una edición normal y no hay nada que avisar.
 */

export type CampoDeLote = 'lineaExtra' | 'fondoDescripcion' | 'inspiracionFotoId' | 'fondo' | 'plantilla' | 'posicionMoto'
export const CAMPOS_DE_LOTE: readonly CampoDeLote[] = ['lineaExtra', 'fondoDescripcion', 'inspiracionFotoId', 'fondo', 'plantilla', 'posicionMoto']

export type PiezaComparable = { id: string } & Record<CampoDeLote, string | null>
export type Reemplazo = { pieza: string; campo: CampoDeLote; antes: string }

export function loQueSeReemplaza(piezas: readonly PiezaComparable[], propuesta: Partial<Record<CampoDeLote, string | null>>, nombreDe: (p: { id: string }) => string): Reemplazo[] {
  const lista: Reemplazo[] = []
  for (const campo of CAMPOS_DE_LOTE) {
    if (!(campo in propuesta)) continue
    const valores = piezas.map((p) => p[campo] ?? null)
    if (valores.every((v) => v === valores[0])) continue
    for (const p of piezas) {
      const antes = p[campo] ?? null
      if (antes !== null && antes !== (propuesta[campo] ?? null)) lista.push({ pieza: nombreDe(p), campo, antes })
    }
  }
  return lista
}
