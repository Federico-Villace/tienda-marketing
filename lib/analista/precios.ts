/**
 * Precios de los modelos del Analista, en US$ por 1 millón de tokens.
 *
 * Si OpenAI cambia un precio hay que editar esta tabla (ADR-017). Un modelo que
 * no figura acá NO se puede usar: es mejor un error que un costo de 0 mentiroso.
 */

export type Precio = {
  readonly entrada: number
  readonly cacheada: number
  readonly escrituraCache: number
  readonly salida: number
}

export const FUENTE_PRECIOS = {
  url: 'https://developers.openai.com/api/docs/pricing',
  verificado: '2026-10-20',
} as const

export const PRECIOS: Readonly<Record<string, Precio>> = {
  'gpt-6-luna': { entrada: 0.1, cacheada: 0.01, escrituraCache: 0.125, salida: 0.5 },
  // La escritura de cache (1,25× la entrada, regla GPT-5.6+) no figura en la
  // página: verificar antes de usar este modelo.
  'gpt-5.6-luna': { entrada: 0.2, cacheada: 0.02, escrituraCache: 0.25, salida: 1.2 },
}

export type Uso = {
  readonly entrada: number
  readonly cacheadas: number
  readonly escrituraCache: number
  readonly salida: number
  /** Informativo: ya está contado dentro de `salida`. */
  readonly razonamiento: number
}

export const tienePrecio = (modelo: string): boolean => Object.hasOwn(PRECIOS, modelo)

export function costoUsd(modelo: string, u: Uso): number {
  if (!tienePrecio(modelo)) throw new Error(`Sin precio para el modelo "${modelo}": no se puede calcular el costo.`)
  const p = PRECIOS[modelo]!
  const normales = u.entrada - u.cacheadas - u.escrituraCache
  const total =
    (normales * p.entrada + u.cacheadas * p.cacheada + u.escrituraCache * p.escrituraCache + u.salida * p.salida) /
    1e6
  return Math.round(total * 1e6) / 1e6
}
