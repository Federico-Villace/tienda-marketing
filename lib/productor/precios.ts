/**
 * Precios oficiales de las imágenes del Productor, en US$.
 *
 * Única fuente de verdad: el catálogo (lib/creativos/motores.ts), el simulador
 * de la home y el servidor leen de acá. Un motor que no figura NO se usa: es
 * mejor un error que un costo de 0 mentiroso (regla #3).
 */

export const FUENTE_PRECIOS_IMAGEN = {
  url: 'https://ai.google.dev/gemini-api/docs/pricing',
  verificado: '2026-10-19',
} as const

/** Cuánto pesa la imagen de entrada (la foto real) en los tokens de entrada. */
export const FUENTE_PRECIO_ENTRADA_IMAGEN = {
  url: 'https://ai.google.dev/gemini-api/docs/pricing',
  verificado: '2026-10-22',
  nota:
    'Pro Image: oficial (560 tokens o US$ 0,0011 por imagen). Nano Banana 2.1: SUPUESTO conservador de 1120 ' +
    '(el máximo de media_resolution por defecto); se compara con usage.total_input_tokens en producción.',
} as const

export type PrecioImagen = {
  readonly nombre: string
  /** US$ por 1M de tokens de entrada. */
  readonly entrada: number
  /** US$ por 1M de tokens de salida de texto y de pensamiento. */
  readonly salidaTexto: number
  /** US$ por 1M de tokens de salida de imagen. */
  readonly salidaImagen: number
  /** US$ por imagen de 1K (precio de lista). */
  readonly porImagen1K: number
  readonly tokensImagen1K: number
  /** Tokens de entrada que suma una foto adjunta (se presupuestan en el tope). */
  readonly tokensImagenEntrada: number
  /** Nivel de pensamiento a pedir; null = no se manda. */
  readonly pensamiento: 'minimal' | null
  /** Tokens de pensamiento que se presupuestan en el tope. */
  readonly topePensamiento: number
  readonly nota: string
}

export const PRECIOS_IMAGEN: Readonly<Record<string, PrecioImagen>> = {
  'gemini-nano-banana-2.1': {
    nombre: 'Nano Banana 2.1',
    entrada: 1.5,
    salidaTexto: 7.5,
    salidaImagen: 30,
    porImagen1K: 0.0336,
    tokensImagen1K: 1120,
    tokensImagenEntrada: 1120,
    pensamiento: 'minimal',
    topePensamiento: 1000,
    nota: 'El recomendado: barato y rápido.',
  },
  'gemini-3-pro-image': {
    nombre: 'Gemini 3 Pro Image',
    entrada: 2,
    salidaTexto: 12,
    salidaImagen: 120,
    porImagen1K: 0.134,
    tokensImagen1K: 1120,
    tokensImagenEntrada: 560,
    pensamiento: null,
    topePensamiento: 4000,
    nota: 'Máxima calidad. Cuesta 4 veces más.',
  },
}

export const MOTOR_IMAGEN_POR_DEFECTO = 'gemini-nano-banana-2.1'
export const MAX_IMAGENES = 4
/** Tokens de entrada que se presupuestan por pedido (prompt + reglas). */
export const TOKENS_ENTRADA_TOPE = 1500

export const tienePrecioImagen = (motor: string): boolean => Object.hasOwn(PRECIOS_IMAGEN, motor)

const redondear = (n: number): number => Math.round(n * 1e6) / 1e6

function exigir(motor: string): PrecioImagen {
  if (!tienePrecioImagen(motor)) throw new Error(`Sin precio para el motor "${motor}": no se puede calcular el costo.`)
  return PRECIOS_IMAGEN[motor]!
}

export type EstimacionImagenes = {
  readonly porImagenUsd: number
  readonly topePorImagenUsd: number
  /** Precio de lista x cantidad. */
  readonly totalUsd: number
  /** Lo que se guarda y se compara con el tope mensual: conservador. */
  readonly topeTotalUsd: number
}

export function estimarImagenes(
  motor: string,
  cantidad: number,
  opciones: { readonly conFoto?: boolean } = {},
): EstimacionImagenes {
  const p = exigir(motor)
  const tokensEntrada = TOKENS_ENTRADA_TOPE + (opciones.conFoto ? p.tokensImagenEntrada : 0)
  const topePorImagenUsd = redondear(
    p.porImagen1K + (tokensEntrada * p.entrada) / 1e6 + (p.topePensamiento * p.salidaTexto) / 1e6,
  )
  return {
    porImagenUsd: p.porImagen1K,
    topePorImagenUsd,
    totalUsd: redondear(p.porImagen1K * cantidad),
    topeTotalUsd: redondear(topePorImagenUsd * cantidad),
  }
}

export type UsoGemini = {
  readonly total_input_tokens?: number
  readonly total_output_tokens?: number
  readonly total_thought_tokens?: number
  readonly output_tokens_by_modality?: readonly { readonly modality?: string; readonly tokens?: number }[]
}

export type CostoDeUso = {
  readonly usd: number
  readonly fuente: 'usage' | 'tarifa' | 'tope' | 'sin_cargo'
  readonly tokens: { entrada: number; imagen: number; texto: number; pensamiento: number }
}

const n = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0)

/** Siempre devuelve un número: el costo real nunca queda null. */
export function costoDeUso(motor: string, uso: UsoGemini | null | undefined, huboImagen: boolean): CostoDeUso {
  const p = exigir(motor)
  if (!uso) {
    return {
      usd: huboImagen ? p.porImagen1K : 0,
      fuente: huboImagen ? 'tarifa' : 'sin_cargo',
      tokens: { entrada: 0, imagen: 0, texto: 0, pensamiento: 0 },
    }
  }
  const entrada = n(uso.total_input_tokens)
  const imagen = (uso.output_tokens_by_modality ?? [])
    .filter((m) => String(m.modality ?? '').toLowerCase() === 'image')
    .reduce((t, m) => t + n(m.tokens), 0)
  const texto = Math.max(0, n(uso.total_output_tokens) - imagen)
  const pensamiento = n(uso.total_thought_tokens)
  const usd = redondear((entrada * p.entrada + imagen * p.salidaImagen + (texto + pensamiento) * p.salidaTexto) / 1e6)
  return { usd, fuente: 'usage', tokens: { entrada, imagen, texto, pensamiento } }
}
