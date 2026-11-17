/**
 * Lo que cuesta verificar los textos de una imagen de copia fiel (ADR-040): una llamada de visión que LEE la imagen. Misma política que la
 * lectura de la referencia (ADR-039): un tope mostrado (un centavo hacia arriba), un costo real con `usage` y, sin él, el tope.
 */

import { estimarImagenes, type CantidadEntradas, type UsoGemini } from '../../productor/precios.ts'
import { centavoArriba, MODELO_VISION_POR_DEFECTO, PRECIOS_VISION, tienePrecioVision } from '../referencia/precios.ts'

/** Tokens de entrada que se presupuestan por las instrucciones del verificador. */
export const TOKENS_PROMPT_VERIFICACION = 1200
/** Tope de tokens de SALIDA (JSON + pensamiento) que se le pide a Gemini. */
export const SALIDA_TOPE_VERIFICACION = 2000
export const TIMEOUT_VERIFICACION_MS = 75_000

const redondear = (n: number): number => Math.round(n * 1e6) / 1e6

function exigir(modelo: string) {
  if (!tienePrecioVision(modelo)) throw new Error(`Sin precio para el modelo de visión "${modelo}": no se puede calcular el costo.`)
  return PRECIOS_VISION[modelo]!
}

export type EstimacionVerificacion = { readonly topeUsd: number; readonly tokensSalidaTope: number; readonly pensamiento: 'low' | null }

export function estimarVerificacion(modelo: string): EstimacionVerificacion {
  const p = exigir(modelo)
  const exacto = ((TOKENS_PROMPT_VERIFICACION + p.tokensImagen) * p.entrada + SALIDA_TOPE_VERIFICACION * p.salida) / 1e6
  return { topeUsd: centavoArriba(exacto), tokensSalidaTope: SALIDA_TOPE_VERIFICACION, pensamiento: p.pensamiento }
}

const n = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0)

export type CostoDeVerificacion = { readonly usd: number; readonly fuente: 'usage' | 'tope'; readonly tokensEntrada: number; readonly tokensSalida: number }

/** Siempre un número. Sin tokens que valgan (sin `usage` o con basura) cuenta el tope: pudo haberse cobrado. */
export function costoDeVerificacion(modelo: string, uso: UsoGemini | null | undefined): CostoDeVerificacion {
  const p = exigir(modelo)
  const entrada = n(uso?.total_input_tokens)
  const salida = n(uso?.total_output_tokens) + n(uso?.total_thought_tokens)
  if (entrada === 0 && salida === 0) return { usd: estimarVerificacion(modelo).topeUsd, fuente: 'tope', tokensEntrada: 0, tokensSalida: 0 }
  return { usd: redondear((entrada * p.entrada + salida * p.salida) / 1e6), fuente: 'usage', tokensEntrada: entrada, tokensSalida: salida }
}

export type EstimacionCopiaFiel = {
  /** Precio de lista de UNA imagen. */
  readonly porImagenUsd: number
  /** Tope de UNA imagen (con la moto y la referencia de entrada). */
  readonly topeImagenUsd: number
  /** Tope de UNA verificación. */
  readonly verificacionUsd: number
  /** Lo que se guarda en la generación y se compara con el tope mensual: imágenes + verificaciones. */
  readonly topeTotalUsd: number
}

/** Las imágenes que recibe Gemini en una copia fiel: la foto de cada moto (1 a 4) y la referencia. Una cantidad inválida lanza: nunca se estima con un número inventado. */
export function imagenesDeEntradaCopia(motos: number): CantidadEntradas {
  if (!Number.isInteger(motos) || motos < 1 || motos > 4) throw new Error(`Una placa lleva de 1 a 4 motos (se pidió ${motos}).`)
  return (motos + 1) as CantidadEntradas
}

/** `imagenesEntrada`: la moto y la referencia (2; con varias motos, una foto por moto más la referencia); un cambio sobre una imagen generada suma la base. */
export function estimarCopiaFiel(motor: string, cantidad: number, modeloVerificacion: string, imagenesEntrada: CantidadEntradas = 2): EstimacionCopiaFiel {
  const img = estimarImagenes(motor, cantidad, { imagenesEntrada })
  const verificacionUsd = estimarVerificacion(modeloVerificacion).topeUsd
  return { porImagenUsd: img.porImagenUsd, topeImagenUsd: img.topePorImagenUsd, verificacionUsd, topeTotalUsd: redondear(img.topeTotalUsd + cantidad * verificacionUsd) }
}

/** El modelo que verifica: MODELO_VERIFICACION_TEXTOS (opcional) o el de visión por defecto. Sin precio en la tabla, no se usa. */
export const modeloDeVerificacion = (entorno: Record<string, string | undefined>): string => entorno.MODELO_VERIFICACION_TEXTOS?.trim() || MODELO_VISION_POR_DEFECTO
