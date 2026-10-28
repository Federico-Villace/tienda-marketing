/**
 * Cuánto cuesta APROXIMADAMENTE cada llamada del Analista. Es lo que dice el botón
 * antes del click (regla #3). El costo REAL lo calcula el servidor con los tokens
 * usados. Vive acá y no en lib/promocion/costos para que el tablero no dependa del
 * área de promociones.
 */

import { costoUsd, tienePrecio } from '../agentes/precios.ts'

const tipico = (modelo: string, entrada: number, salida: number): number | null =>
  tienePrecio(modelo) ? costoUsd(modelo, { entrada, cacheadas: 0, escrituraCache: 0, salida, razonamiento: 0 }) : null

/** ~6.000 tokens de entrada (agregados + hechos) y ~4.500 de salida (JSON + razonamiento). */
export const costoAproximadoAnalisis = (modelo: string): number | null => tipico(modelo, 6000, 4500)

/** ~6.500 de entrada y ~1.000 de salida, sin suponer caché de prefijo (el peor caso). */
export const costoAproximadoPregunta = (modelo: string): number | null => tipico(modelo, 6500, 1000)

const tresDecimales = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
export const formatearCostoAproximado = (n: number | null): string => (n === null ? '' : `~US$ ${tresDecimales.format(n)}`)
