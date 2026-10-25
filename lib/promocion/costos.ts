/**
 * Cuánto cuesta APROXIMADAMENTE cada paso que llama a un modelo de texto. Es lo que
 * dice el botón antes del click (regla #3: nada gasta sin que se vea). El costo REAL
 * lo calcula el servidor con los tokens que usó y queda registrado.
 *
 * Los tamaños son los de una llamada típica de cada paso (entrada y salida con el
 * razonamiento incluido); sirven para dar el orden de magnitud, no el centavo.
 */

import { costoUsd, tienePrecio } from '../agentes/precios.ts'

const tipico = (modelo: string, entrada: number, salida: number): number | null =>
  tienePrecio(modelo) ? costoUsd(modelo, { entrada, cacheadas: 0, escrituraCache: 0, salida, razonamiento: 0 }) : null

export const costoAproximadoAntecedentes = (modelo: string): number | null => tipico(modelo, 4000, 3500)
export const costoAproximadoTextos = (modelo: string): number | null => tipico(modelo, 1500, 5500)

const tresDecimales = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
export const formatearCostoAproximado = (n: number | null): string => (n === null ? '' : `~US$ ${tresDecimales.format(n)}`)
