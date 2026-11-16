/** Dónde pega nuestro renderer el logo real sobre la imagen de copia fiel: la caja que vio el verificador, si sirve; si no, arriba al centro. Puro. */

import type { Caja01 } from './tipos.ts'

export const ZONA_LOGO_POR_DEFECTO: Caja01 = { x: 0.3, y: 0.02, w: 0.4, h: 0.08 }

const W = { min: 0.08, max: 0.6 }
const H = { min: 0.03, max: 0.2 }
const EPS = 1e-9

export function zonaLogo(caja: Caja01 | null): { caja: Caja01; porDefecto: boolean } {
  const porDefecto = { caja: ZONA_LOGO_POR_DEFECTO, porDefecto: true }
  if (!caja || ![caja.x, caja.y, caja.w, caja.h].every(Number.isFinite)) return porDefecto
  // Se acota al lienzo primero: lo que sobresale no cuenta.
  const x0 = Math.max(0, caja.x)
  const y0 = Math.max(0, caja.y)
  const x1 = Math.min(1, caja.x + caja.w)
  const y1 = Math.min(1, caja.y + caja.h)
  const w = x1 - x0
  const h = y1 - y0
  if (w < W.min - EPS || w > W.max + EPS || h < H.min - EPS || h > H.max + EPS) return porDefecto
  const r = (n: number) => Math.round(n * 1e6) / 1e6
  return { caja: { x: r(x0), y: r(y0), w: r(w), h: r(h) }, porDefecto: false }
}
