/**
 * Precio del modelo de visión que LEE la foto de referencia (ADR-039), en US$.
 *
 * Única fuente de verdad del modelo y de su precio: el estimado que ve la persona, la reserva de la compuerta y el
 * costo real salen de acá. Un modelo que no figura NO se usa: mejor un error que un costo de 0 mentiroso (regla #3).
 *
 * Cambiar de modelo = cambiar `MODELO_VISION_POR_DEFECTO` (o la variable MODELO_LECTURA_REFERENCIA) y, si hace falta,
 * la fila de la tabla. Nada más del código lo nombra.
 */

import type { UsoGemini } from '../../productor/precios.ts'

export const FUENTE_PRECIOS_VISION = {
  url: 'https://ai.google.dev/gemini-api/docs/pricing',
  nota:
    'A CONFIRMAR POR FEDERICO. Gemini 4 Carbon sale con un precio de lanzamiento de US$ 2 / 10 por millón de tokens y el de ' +
    'Argon sube a 4 / 20 el 2026-12-01. Se carga el conservador (4 / 20) para que el tope mostrado nunca quede corto.',
} as const

export type PrecioVision = {
  readonly nombre: string
  /** US$ por 1M de tokens de entrada (texto e imagen). */
  readonly entrada: number
  /** US$ por 1M de tokens de salida, pensamiento incluido. */
  readonly salida: number
  /** Tokens que suma la foto de referencia. SUPUESTO conservador (el máximo de media_resolution por defecto). */
  readonly tokensImagen: number
  /** Tope de tokens de SALIDA (JSON + pensamiento): se le pide a Gemini y se presupuesta en el estimado. */
  readonly tokensSalidaTope: number
  /** Nivel de pensamiento a pedir; null = no se manda. */
  readonly pensamiento: 'low' | null
  /** Hay que confirmar el precio con la tabla oficial. */
  readonly aConfirmar: boolean
}

const CONSERVADOR = { entrada: 4, salida: 20, tokensImagen: 1120, tokensSalidaTope: 3000, pensamiento: 'low', aConfirmar: true } as const

export const PRECIOS_VISION: Readonly<Record<string, PrecioVision>> = {
  'gemini-4-carbon': { nombre: 'Gemini 4 Carbon', ...CONSERVADOR },
  'gemini-4-argon': { nombre: 'Gemini 4 Argon', ...CONSERVADOR },
  'gemini-4-hydrogen': { nombre: 'Gemini 4 Hydrogen', ...CONSERVADOR },
}

/** El mejor modelo de visión disponible: Gemini 4 Carbon (análisis multimodal de alto riesgo). */
export const MODELO_VISION_POR_DEFECTO = 'gemini-4-carbon'

/** Tokens de entrada que se presupuestan por el texto del pedido (instrucciones del prompt de lectura). */
export const TOKENS_PROMPT_LECTURA = 1500

export const tienePrecioVision = (modelo: string): boolean => Object.hasOwn(PRECIOS_VISION, modelo)

function exigir(modelo: string): PrecioVision {
  if (!tienePrecioVision(modelo)) throw new Error(`Sin precio para el modelo de visión "${modelo}": no se puede calcular el costo.`)
  return PRECIOS_VISION[modelo]!
}

const redondear = (n: number): number => Math.round(n * 1e6) / 1e6
/** Hacia ARRIBA al centavo: lo que se muestra nunca es menos que lo que se podría gastar. */
const centavoArriba = (n: number): number => Math.ceil(Math.round(n * 1e6) / 1e4 - 1e-9) / 100

export type EstimacionLectura = {
  /** Lo que se muestra, se acepta y se compara con el tope mensual. Múltiplo de US$ 0,01. */
  readonly topeUsd: number
  readonly tokensSalidaTope: number
  readonly pensamiento: 'low' | null
}

export function estimarLectura(modelo: string): EstimacionLectura {
  const p = exigir(modelo)
  const exacto = ((TOKENS_PROMPT_LECTURA + p.tokensImagen) * p.entrada + p.tokensSalidaTope * p.salida) / 1e6
  return { topeUsd: centavoArriba(exacto), tokensSalidaTope: p.tokensSalidaTope, pensamiento: p.pensamiento }
}

export type CostoDeLectura = {
  readonly usd: number
  readonly fuente: 'usage' | 'tope'
  readonly tokensEntrada: number
  readonly tokensSalida: number
}

const n = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0)

/** Siempre un número. Sin tokens que valgan (sin `usage` o con basura) cuenta el tope: pudo haberse cobrado. */
export function costoDeLectura(modelo: string, uso: UsoGemini | null | undefined): CostoDeLectura {
  const p = exigir(modelo)
  const entrada = n(uso?.total_input_tokens)
  const salida = n(uso?.total_output_tokens) + n(uso?.total_thought_tokens)
  if (entrada === 0 && salida === 0) return { usd: estimarLectura(modelo).topeUsd, fuente: 'tope', tokensEntrada: 0, tokensSalida: 0 }
  return { usd: redondear((entrada * p.entrada + salida * p.salida) / 1e6), fuente: 'usage', tokensEntrada: entrada, tokensSalida: salida }
}

/** El modelo que lee: MODELO_LECTURA_REFERENCIA (opcional) o el de por defecto. Sin precio en la tabla, no se usa. */
export const modeloDeLectura = (entorno: Record<string, string | undefined>): string => entorno.MODELO_LECTURA_REFERENCIA?.trim() || MODELO_VISION_POR_DEFECTO
