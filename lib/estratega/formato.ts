import { formatearUsdCorto } from '../costos/formato.ts'

/** Formatos de números para la pantalla de campañas (es-AR). */

const ars = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

/** Costo real a centavos (el detalle exacto: lib/costos/formato). */
export const formatearUsd = (n: number): string => formatearUsdCorto(n)

export const formatearArs = (n: number): string => `ARS ${ars.format(n)}`
