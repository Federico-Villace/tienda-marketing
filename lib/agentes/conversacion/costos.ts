/** Costo aproximado de un cambio de texto: lo que dice el botón antes del click (regla #3). */

import { costoUsd, tienePrecio } from '../precios.ts'

/** ~2.500 tokens de entrada (texto actual + instrucciones) y ~1.500 de salida (JSON + razonamiento). */
export const costoAproximadoCambioTexto = (modelo: string): number | null =>
  tienePrecio(modelo) ? costoUsd(modelo, { entrada: 2500, cacheadas: 0, escrituraCache: 0, salida: 1500, razonamiento: 0 }) : null

const tresDecimales = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
export const formatearCostoCambio = (n: number | null): string => (n === null ? '' : `~US$ ${tresDecimales.format(n)}`)
