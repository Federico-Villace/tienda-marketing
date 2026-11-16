/** Contraste WCAG entre colores declarados (no hay forma de medir píxeles sin decodificar la imagen). Puro. */

import type { Hex } from './tipos.ts'

export const BLANCO_LEGIBLE: Hex = '#FFFFFF'
export const NEGRO_LEGIBLE: Hex = '#0B0B0D'

const canales = (hex: Hex): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]

/** Luminancia relativa WCAG 2.x (0 negro … 1 blanco). */
export function luminancia(hex: Hex): number {
  const [r, g, b] = canales(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function ratioContraste(a: Hex, b: Hex): number {
  const [la, lb] = [luminancia(a), luminancia(b)]
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** `texto` si ya contrasta `minimo` con `fondo`; si no, blanco o el negro de la marca (el que más contraste). */
export function colorLegible(texto: Hex, fondo: Hex, minimo: number): Hex {
  if (ratioContraste(texto, fondo) >= minimo) return texto
  return ratioContraste(BLANCO_LEGIBLE, fondo) >= ratioContraste(NEGRO_LEGIBLE, fondo) ? BLANCO_LEGIBLE : NEGRO_LEGIBLE
}

/** Mezcla lineal en sRGB (para el color del centro de un degradé). t=0 → a, t=1 → b. */
export function mezclar(a: Hex, b: Hex, t: number): Hex {
  const [ca, cb] = [canales(a), canales(b)]
  const k = Math.max(0, Math.min(1, t))
  return `#${ca.map((c, i) => Math.round(c + (cb[i]! - c) * k).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}
