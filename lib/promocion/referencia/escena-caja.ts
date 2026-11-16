/**
 * Dónde se dibuja la escena en la plantilla 'referencia'. La escena (la foto de la moto con su fondo) se genera UNA vez con la
 * composición "marco": la moto centrada, ~70 % del ancho, en la franja del 30 % al 75 % del alto (arriba y abajo, aire). Cada formato
 * pone esa franja en la caja de la moto de la referencia: la escena se dibuja más grande que la caja (el aire sobra por arriba y por
 * abajo y se funde con el fondo), nunca recortada por la caja. Puro: se testea con números.
 */

import type { Caja } from '../diseno/layouts.ts'

/** Lo que pide `composicion('marco')` en escena.ts: 70 % del ancho, desde el 30 % hasta el 75 % del alto. */
export const BANDA_MOTO_EN_ESCENA = { w: 0.7, desde: 0.3, hasta: 0.75 } as const

const ASPECTO_POR_DEFECTO = 0.8

/**
 * La caja de la escena (px del lienzo) tal que su franja de la moto cabe en `moto` y la toca por el lado más justo.
 * `aspecto` = ancho / alto de la escena (el formato de la promoción, no el del lienzo que se dibuja).
 */
export function cajaDeEscena(moto: Caja, aspecto: number): Caja {
  const a = Number.isFinite(aspecto) && aspecto > 0 ? aspecto : ASPECTO_POR_DEFECTO
  const altoBanda = BANDA_MOTO_EN_ESCENA.hasta - BANDA_MOTO_EN_ESCENA.desde
  // Alto de la escena (en px) para que la banda quepa: por ancho o por alto, el que mande.
  const alto = Math.min(moto.w / (BANDA_MOTO_EN_ESCENA.w * a), moto.h / altoBanda)
  const ancho = alto * a
  const centroX = moto.x + moto.w / 2
  // La banda de la moto se centra en vertical en la caja.
  const centroBanda = (BANDA_MOTO_EN_ESCENA.desde + BANDA_MOTO_EN_ESCENA.hasta) / 2
  const y = moto.y + moto.h / 2 - alto * centroBanda
  return { x: Math.round(centroX - ancho / 2), y: Math.round(y), w: Math.round(ancho), h: Math.round(alto) }
}
