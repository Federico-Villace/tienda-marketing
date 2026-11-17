/**
 * Las fotos de las OTRAS motos de una placa de varias motos (ADR-041) viajan con la generación en `parametros.fotosExtra` (los ids, en el orden de las
 * motos 2 a 4). La estimación las escribe; la confirmación las lee. Puro.
 */

import { UUID } from '../agentes/http.ts'

export const MAX_FOTOS_EXTRA = 3

/** Los ids de las fotos de las motos 2 a 4, en orden. Sin la clave, []. Algo que no sea una lista de 1 a 3 UUID distintos es inválido (null). */
export function fotosExtraDe(parametros: unknown): string[] | null {
  if (parametros === null || typeof parametros !== 'object' || Array.isArray(parametros)) return []
  const crudo = (parametros as Record<string, unknown>).fotosExtra
  if (crudo === undefined) return []
  if (!Array.isArray(crudo) || crudo.length < 1 || crudo.length > MAX_FOTOS_EXTRA) return null
  if (!crudo.every((x): x is string => typeof x === 'string' && UUID.test(x))) return null
  if (new Set(crudo).size !== crudo.length) return null
  return crudo
}
