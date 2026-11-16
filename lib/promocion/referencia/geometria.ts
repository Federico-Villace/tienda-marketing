/** Geometría de cajas en px, pura y con enteros. La comparten la reparación (reparar.ts) y el layout elástico (layout.ts). */

import type { CajaPx } from './tipos.ts'

export const interseca = (a: CajaPx, b: CajaPx): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

export const dentroDe = (c: CajaPx, lim: CajaPx): boolean => c.x >= lim.x && c.y >= lim.y && c.x + c.w <= lim.x + lim.w && c.y + c.h <= lim.y + lim.h

export const cumple = (c: CajaPx, min: { w: number; h: number }): boolean => c.w >= min.w && c.h >= min.h

/** La parte de `c` que cae dentro de `lim` (recorta, no mueve). null si no queda nada. */
export function recortar(c: CajaPx, lim: CajaPx): CajaPx | null {
  const x0 = Math.max(c.x, lim.x)
  const y0 = Math.max(c.y, lim.y)
  const x1 = Math.min(c.x + c.w, lim.x + lim.w)
  const y1 = Math.min(c.y + c.h, lim.y + lim.h)
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null
}

/** Mete `c` en `lim` MOVIÉNDOLA (y achicándola solo si es más grande que `lim`). */
export function encajar(c: CajaPx, lim: CajaPx): CajaPx {
  const w = Math.min(c.w, lim.w)
  const h = Math.min(c.h, lim.h)
  return { x: Math.max(lim.x, Math.min(c.x, lim.x + lim.w - w)), y: Math.max(lim.y, Math.min(c.y, lim.y + lim.h - h)), w, h }
}

/** Agranda `c` desde su centro hasta `min` (si ya lo cumple no la toca) y la mete en `lim`. null si `lim` no admite el mínimo. */
export function agrandar(c: CajaPx, min: { w: number; h: number }, lim: CajaPx): CajaPx | null {
  const w = Math.max(c.w, min.w)
  const h = Math.max(c.h, min.h)
  if (w > lim.w || h > lim.h) return null
  const cx = c.x + c.w / 2
  const cy = c.y + c.h / 2
  return encajar({ x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h }, lim)
}

/**
 * Saca a `c` de encima de los `obstaculos`: la corre por el eje de MENOR desplazamiento (vertical primero si empata) hasta
 * apoyarla en el borde del obstáculo y recorta lo que quede fuera de `lim`. Prueba las cuatro salidas de la más corta a la
 * más larga y se queda con la primera que todavía cumple `min` y no vuelve a pisar a otro. null si no hay lugar.
 */
export function despejar(c: CajaPx, obstaculos: readonly CajaPx[], lim: CajaPx, min: { w: number; h: number }, profundidad = 0): CajaPx | null {
  const o = obstaculos.find((x) => interseca(c, x))
  if (!o) return c
  if (profundidad > obstaculos.length + 2) return null
  const opciones: { d: number; caja: CajaPx }[] = [
    { d: c.y + c.h - o.y, caja: { ...c, y: o.y - c.h } },
    { d: o.y + o.h - c.y, caja: { ...c, y: o.y + o.h } },
    { d: c.x + c.w - o.x, caja: { ...c, x: o.x - c.w } },
    { d: o.x + o.w - c.x, caja: { ...c, x: o.x + o.w } },
  ]
  // sort estable: a igual desplazamiento queda primero el vertical (arriba, abajo, izquierda, derecha).
  for (const { caja } of opciones.sort((a, b) => a.d - b.d)) {
    const r = recortar(caja, lim)
    if (!r || !cumple(r, min)) continue
    const fin = despejar(r, obstaculos, lim, min, profundidad + 1)
    if (fin) return fin
  }
  return null
}
