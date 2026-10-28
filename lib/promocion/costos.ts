/**
 * Cuánto cuesta APROXIMADAMENTE cada paso que llama a un modelo de texto. Es lo que
 * dice el botón antes del click (regla #3: nada gasta sin que se vea). El costo REAL
 * lo calcula el servidor con los tokens que usó y queda registrado.
 *
 * Los tamaños son los de una llamada típica de cada paso (entrada y salida con el
 * razonamiento incluido); sirven para dar el orden de magnitud, no el centavo.
 */

import { costoUsd, tienePrecio } from '../agentes/precios.ts'
import { estimarImagenes } from '../productor/precios.ts'

const tipico = (modelo: string, entrada: number, salida: number): number | null =>
  tienePrecio(modelo) ? costoUsd(modelo, { entrada, cacheadas: 0, escrituraCache: 0, salida, razonamiento: 0 }) : null

export const costoAproximadoAntecedentes = (modelo: string): number | null => tipico(modelo, 4000, 3500)
export const costoAproximadoTextos = (modelo: string): number | null => tipico(modelo, 1500, 5500)

const tresDecimales = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
export const formatearCostoAproximado = (n: number | null): string => (n === null ? '' : `~US$ ${tresDecimales.format(n)}`)

/** El total de un lote de N llamadas iguales (una por marca). null si no se conoce el unitario. */
export const costoLote = (unitario: number | null, n: number): number | null => (unitario === null ? null : unitario * n)

/** "~US$ 0,014 (7 × ~US$ 0,002)": lo que dice el botón de un lote antes del click (regla #3). */
export function formatearCostoLote(unitario: number | null, n: number): string {
  if (unitario === null) return ''
  if (n <= 1) return formatearCostoAproximado(unitario)
  return `${formatearCostoAproximado(costoLote(unitario, n))} (${n} × ${formatearCostoAproximado(unitario)})`
}

/**
 * Lo que cuesta el lote de escenas de una tanda de motos (ADR-032): una escena por moto,
 * cada una de `variantes` imágenes (1 o 2). El tope es lo que se compara con el tope del
 * mes y lo que se confirma; el precio de lista es lo que se espera pagar. Un motor sin
 * precio lanza: es mejor un error que un costo de 0 mentiroso (regla #3).
 */
export function costoLoteImagenes(
  motor: string,
  motos: number,
  variantes: number,
  opciones: { conReferencia?: boolean } = {},
): { imagenes: number; porMotoUsd: number; topeTotalUsd: number; totalListaUsd: number } {
  const e = estimarImagenes(motor, variantes, { conFoto: true, conReferencia: opciones.conReferencia })
  const redondear = (n: number) => Math.round(n * 1e6) / 1e6
  return {
    imagenes: motos * variantes,
    porMotoUsd: e.topeTotalUsd,
    topeTotalUsd: redondear(e.topeTotalUsd * motos),
    totalListaUsd: redondear(e.totalUsd * motos),
  }
}
