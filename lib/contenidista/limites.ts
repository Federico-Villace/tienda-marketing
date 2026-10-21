/** Límites de las piezas, compartidos por el validador y la pantalla. */

import type { Pieza } from './tipos.ts'

/** Instagram verificado; el de Facebook (63.206) es más alto, se usa el de IG como supuesto (ADR-021). */
export const LIMITES = {
  COPY: 2200,
  HASHTAGS: 30,
  MENCIONES: 20,
  ALT: 1000,
  HOOK: 150,
  CTA: 150,
  GUION: 2000,
  BRIEF_VISUAL: 600,
  PIEZAS_POR_SEMANA: 12,
  NOTAS: 1000,
} as const

/** Lo que realmente se publica: el copy más los hashtags al final. */
export const textoPublicado = (p: Pick<Pieza, 'copy' | 'hashtags'>): string =>
  p.copy + (p.hashtags.length > 0 ? `\n\n${p.hashtags.join(' ')}` : '')
