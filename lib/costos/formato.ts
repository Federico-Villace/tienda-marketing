/**
 * Cómo se ven los costos en pantalla. SOLO display: no toca valores guardados, topes ni la cuenta de la
 * compuerta de costo. Corto = centavos legibles; exacto = el detalle de 4 a 6 decimales (va en el title).
 * Un estimado se redondea HACIA ARRIBA: nunca se muestra menos de lo que puede costar.
 */

const dos = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const exacto = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 4, maximumFractionDigits: 6 })

export const formatearUsdExacto = (n: number): string => `US$ ${exacto.format(n)}`

export function formatearUsdCorto(n: number, o: { estimado?: boolean } = {}): string {
  if (!(n > 0)) return 'US$ 0'
  if (o.estimado) return `~US$ ${dos.format(Math.ceil(n * 100 - 1e-9) / 100)}`
  if (n < 0.01) return 'menos de US$ 0,01'
  return `US$ ${dos.format(n)}`
}
