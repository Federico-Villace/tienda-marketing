/** Acento y tono de una placa "referencia": salen de la plantilla leída, no de una tabla fija. Puro. */

import { colorDe, type ColorAcento } from '../diseno/paletas.ts'
import type { Acento } from '../diseno/tipos.ts'
import { BLANCO_LEGIBLE, luminancia, mezclar, NEGRO_LEGIBLE, ratioContraste } from './contraste.ts'
import type { PlantillaReferencia } from './tipos.ts'

/** "Original" = el acento leído; los demás, los cinco de siempre. */
export function colorAcentoReferencia(p: PlantillaReferencia, acento: Acento): ColorAcento {
  if (acento !== 'original') return colorDe('referencia', acento)
  const sobre = ratioContraste(BLANCO_LEGIBLE, p.acento) >= ratioContraste(NEGRO_LEGIBLE, p.acento) ? BLANCO_LEGIBLE : NEGRO_LEGIBLE
  return { hex: p.acento, nombre: 'Original', sobre }
}

/** El color del medio del fondo (el centro del degradé): contra él se mide lo que se dibuja sobre el fondo. */
export function colorFondoMedio(p: Pick<PlantillaReferencia, 'fondo'>): string {
  const f = p.fondo
  return f.tipo === 'degradado' && f.color2 ? mezclar(f.color, f.color2, 0.5) : f.color
}

/** Decide qué versión de los logos se usa (como `tono` de las otras): por la luminancia del fondo (el medio del degradé). */
export function tonoDeReferencia(p: PlantillaReferencia): 'oscuro' | 'claro' {
  const medio = colorFondoMedio(p)
  // 0,18 es la luminancia donde el blanco y el negro contrastan igual: más oscuro que eso, el logo claro se lee mejor.
  return luminancia(medio) < 0.18 ? 'oscuro' : 'claro'
}
