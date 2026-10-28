/**
 * Tipos y límites de las placas en lote (ADR-032). Una tanda puede ser de marcas (la de
 * siempre: una moto en N marcas), de motos (N motos con el mismo diseño, cada una en
 * M marcas) o de textos (una moto, K textos sobre UNA escena). 'combinada' no es un
 * tipo: es 'motos' con más de una marca.
 */

export const TIPOS_TANDA = ['marcas', 'motos', 'textos'] as const
export type TipoTanda = (typeof TIPOS_TANDA)[number]
export const esTipoTanda = (x: unknown): x is TipoTanda => typeof x === 'string' && (TIPOS_TANDA as readonly string[]).includes(x)

export const LIMITES_LOTE = {
  MOTOS_MIN: 2,
  MOTOS: 10,
  MARCAS: 7,
  /** motos × marcas: más que esto es inmanejable en pantalla y en la revisión. */
  PLACAS: 14,
  TEXTOS_MIN: 2,
  TEXTOS: 5,
  /** Imágenes por escena que se pueden pedir (la escena de cada moto). */
  VARIANTES_IMAGEN: 2,
} as const
