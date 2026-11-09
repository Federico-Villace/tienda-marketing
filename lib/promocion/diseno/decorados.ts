/**
 * Decorados determinísticos de las plantillas de diseño: paths SVG generados con un PRNG con semilla.
 * Mismo lienzo y misma semilla = mismos paths, siempre (la placa es reproducible y el hash no se mueve).
 */

import { prng } from './texturas.ts'

export type Pincelada = { /** Path SVG cerrado. */ d: string; opacidad: number }

const r1 = (n: number) => Math.round(n * 10) / 10

/** Una pincelada: una franja con bordes irregulares, de (x,y) hacia `ang` radianes. */
function franja(azar: () => number, x: number, y: number, largo: number, grosor: number, ang: number): string {
  const pasos = 7
  const dx = Math.cos(ang)
  const dy = Math.sin(ang)
  const nx = -dy
  const ny = dx
  const arriba: string[] = []
  const abajo: string[] = []
  for (let i = 0; i <= pasos; i++) {
    const t = (i / pasos) * largo
    // El grosor se afina hacia las puntas y tiembla un poco: se ve a mano.
    const forma = Math.sin((i / pasos) * Math.PI) * 0.7 + 0.3
    const a = (grosor / 2) * forma * (0.8 + azar() * 0.4)
    const b = (grosor / 2) * forma * (0.8 + azar() * 0.4)
    arriba.push(`${r1(x + dx * t + nx * a)} ${r1(y + dy * t + ny * a)}`)
    abajo.push(`${r1(x + dx * t - nx * b)} ${r1(y + dy * t - ny * b)}`)
  }
  return `M${arriba[0]} L${arriba.slice(1).join(' L')} L${abajo.reverse().join(' L')} Z`
}

/** Pinceladas que asoman detrás de la moto y del modelo. `ancho`×`alto` es el lienzo de la placa. */
export function pinceladas(ancho: number, alto: number, semilla: number): Pincelada[] {
  const azar = prng(semilla + ancho * 7 + alto * 13)
  const lista: Pincelada[] = []
  // Dos grandes que cruzan el lienzo (arriba y abajo), y varias más chicas repartidas.
  lista.push({ d: franja(azar, -40, alto * (0.2 + azar() * 0.05), ancho * 0.8, alto * 0.07, -0.18 + azar() * 0.1), opacidad: 0.9 })
  lista.push({ d: franja(azar, ancho * 0.12, alto * (0.78 + azar() * 0.04), ancho * 0.85, alto * 0.06, -0.12 + azar() * 0.08), opacidad: 0.85 })
  for (let i = 0; i < 4; i++) {
    const x = azar() * ancho * 0.7
    const y = alto * 0.1 + azar() * alto * 0.75
    // Cortas y con ángulo suave: no se salen del lienzo.
    lista.push({ d: franja(azar, x, y, Math.min(90 + azar() * 220, ancho - x - 20), 10 + azar() * 26, -0.5 + azar() * 1), opacidad: 0.35 + azar() * 0.45 })
  }
  return lista
}
