/**
 * Llave de caché de los agentes: sha256 de un JSON canónico (claves ordenadas),
 * así el mismo contenido con las claves en otro orden da el mismo hash.
 */

import { createHash } from 'node:crypto'

function canonico(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonico)
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, x]) => [k, canonico(x)]),
    )
  }
  return v
}

export const hashJson = (v: unknown): string =>
  createHash('sha256').update(JSON.stringify(canonico(v))).digest('hex')
