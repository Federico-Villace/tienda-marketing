/**
 * Decorados determinísticos de las plantillas de diseño: paths SVG generados con un PRNG con semilla.
 * Mismo lienzo y misma semilla = mismos paths, siempre (la placa es reproducible y el hash no se mueve).
 */

import type { Caja } from './layouts.ts'
import { prng } from './texturas.ts'

export type Pincelada = { /** Path SVG cerrado. */ d: string; opacidad: number; /** Caja que la contiene (solo las que se pueden descartar). */ caja?: Caja; /** Las diagonales finas de la deportiva van en blanco, no en el acento. */ blanco?: boolean; /** Se dibuja por delante de la escena (lo que asoma por los costados, nítido); el resto va detrás. */ frente?: boolean }

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

/**
 * Pinceladas que asoman detrás de la moto y del modelo. `ancho`×`alto` es el lienzo de la placa. Las chicas que caerían sobre
 * una caja de `evitar` (la frase, que va en el mismo color) se descartan: así el texto de acento nunca queda sobre acento.
 */
export function pinceladas(ancho: number, alto: number, semilla: number, evitar: readonly Caja[] = []): Pincelada[] {
  const azar = prng(semilla + ancho * 7 + alto * 13)
  const lista: Pincelada[] = []
  // Dos grandes que cruzan el lienzo (arriba y abajo), y varias más chicas repartidas.
  lista.push({ d: franja(azar, -40, alto * (0.2 + azar() * 0.05), ancho * 0.8, alto * 0.07, -0.18 + azar() * 0.1), opacidad: 0.9 })
  lista.push({ d: franja(azar, ancho * 0.12, alto * (0.78 + azar() * 0.04), ancho * 0.85, alto * 0.06, -0.12 + azar() * 0.08), opacidad: 0.85 })
  for (let i = 0; i < 4; i++) {
    const x = azar() * ancho * 0.7
    const y = alto * 0.1 + azar() * alto * 0.75
    // Cortas y con ángulo suave: no se salen del lienzo.
    const largo = Math.min(90 + azar() * 220, ancho - x - 20)
    const grosor = 10 + azar() * 26
    const ang = -0.5 + azar() * 1
    const opacidad = 0.35 + azar() * 0.45
    const fin = { x: x + Math.cos(ang) * largo, y: y + Math.sin(ang) * largo }
    const caja: Caja = { x: Math.min(x, fin.x) - grosor, y: Math.min(y, fin.y) - grosor, w: Math.abs(fin.x - x) + grosor * 2, h: Math.abs(fin.y - y) + grosor * 2 }
    const pisa = evitar.some((c) => caja.x < c.x + c.w && c.x < caja.x + caja.w && caja.y < c.y + c.h && c.y < caja.y + caja.h)
    // Siempre se gasta el azar (la forma y la semilla de las otras no cambian); lo que se descarta, no se dibuja.
    const d = franja(azar, x, y, largo, grosor, ang)
    if (!pisa) lista.push({ d, opacidad, caja })
  }
  return lista
}

/**
 * Diagonales de la deportiva (como en una carenada): cuñas de acento que entran por las esquinas y por el costado derecho, y
 * un par de líneas finas blancas. Van detrás de la moto, que las tapa en el centro y las deja asomar por los bordes. Ninguna
 * toca el logo, el panel del modelo, la frase, la barra de precio ni el pie: el texto blanco no queda nunca sobre el color flúor.
 */
export function diagonales(ancho: number, alto: number): Pincelada[] {
  const inclinacion = Math.tan((12 * Math.PI) / 180)
  const poligono = (pts: [number, number][], opacidad = 1): Pincelada => ({ d: `M${pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join(' L')} Z`, opacidad })
  const fina = (x: number, y: number, w: number, h: number, opacidad: number): Pincelada => {
    const dx = h * inclinacion
    return { ...poligono([[x + dx, y], [x + w + dx, y], [x + w, y + h], [x, y + h]], opacidad), blanco: true, frente: true }
  }
  return [
    // Arriba a la izquierda (el logo va centrado: la esquina queda libre).
    poligono([[0, 0], [ancho * 0.19, 0], [0, alto * 0.085]]),
    // Cuña que entra por la derecha a media altura y se mete detrás de la moto (la escena la tapa); la punta que asoma por el costado
    // se repite por delante, nítida, hasta el 90 % del ancho (la moto ocupa ~70 %: no la pisa).
    poligono([[ancho, alto * 0.385], [ancho * 0.74, alto * 0.58], [ancho, alto * 0.58]]),
    { ...poligono([[ancho, alto * 0.385], [ancho * 0.9, alto * 0.46], [ancho * 0.875, alto * 0.58], [ancho, alto * 0.58]]), frente: true },
    // Abajo, las dos esquinas, por debajo del pie.
    poligono([[0, alto * 0.945], [ancho * 0.15, alto], [0, alto]]),
    poligono([[ancho, alto * 0.945], [ancho, alto], [ancho * 0.86, alto]]),
    // Líneas finas a la izquierda, a la altura de la cola de la moto.
    fina(-20, alto * 0.388, ancho * 0.17, 4, 0.9),
    fina(0, alto * 0.4, ancho * 0.13, 3, 0.9),
  ]
}

/**
 * Curvas de nivel de la editorial: anillos concéntricos con el contorno ondulado por ruido con semilla (como un mapa
 * topográfico). Dos grupos de anillos, uno en cada punta del lienzo. Líneas finas, de baja opacidad.
 */
export function curvasDeNivel(ancho: number, alto: number, semilla: number): Pincelada[] {
  const azar = prng(semilla + ancho * 3 + alto * 11)
  const centros = [
    { x: ancho * (0.12 + azar() * 0.1), y: alto * (0.2 + azar() * 0.1) },
    { x: ancho * (0.82 + azar() * 0.1), y: alto * (0.72 + azar() * 0.1) },
  ]
  const lista: Pincelada[] = []
  for (const c of centros) {
    // El mismo "relieve" para todos los anillos de un centro: así no se cruzan.
    const fases = [azar() * 6.28, azar() * 6.28, azar() * 6.28]
    const amps = [0.1 + azar() * 0.06, 0.05 + azar() * 0.04, 0.03 + azar() * 0.03]
    for (let k = 1; k <= 6; k++) {
      const radio = 70 + k * 62
      const pasos = 36
      const pts: string[] = []
      for (let i = 0; i < pasos; i++) {
        const a = (i / pasos) * Math.PI * 2
        const onda = amps[0]! * Math.sin(2 * a + fases[0]!) + amps[1]! * Math.sin(3 * a + fases[1]!) + amps[2]! * Math.sin(5 * a + fases[2]!)
        const r = radio * (1 + onda)
        pts.push(`${r1(c.x + Math.cos(a) * r)} ${r1(c.y + Math.sin(a) * r * 0.85)}`)
      }
      lista.push({ d: `M${pts[0]} L${pts.slice(1).join(' L')} Z`, opacidad: 0.18 })
    }
  }
  return lista
}
