/** Formatos de números para la pantalla de campañas (es-AR). */

const usd = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 4, maximumFractionDigits: 6 })
const ars = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

/** Siempre con 4 decimales o más: un plan cuesta centésimas de centavo. */
export const formatearUsd = (n: number): string => `US$ ${usd.format(n)}`

export const formatearArs = (n: number): string => `ARS ${ars.format(n)}`
