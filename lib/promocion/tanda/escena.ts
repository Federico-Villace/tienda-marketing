/**
 * La escena de una tanda (ADR-028). El prompt de la escena NO usa la marca
 * (promptEscena: fondo, zona, formato, indicaciones): si las hijas comparten foto,
 * formato, diseño, fondo e indicaciones, la imagen sería la MISMA N veces y se
 * genera una sola (un cobro). La marca va en la placa, que es gratis.
 */

import type { DatosPromocion } from '../tipos.ts'

type HijaParaEscena = {
  readonly foto_id: string
  readonly aspecto: string
  readonly plantilla: string | null
  readonly fondo: string | null
  readonly datos: Pick<DatosPromocion, 'indicaciones'>
}

export type ResultadoEscena = { readonly ok: true } | { readonly ok: false; readonly difieren: readonly string[] }

const CAMPOS: readonly (readonly [string, (h: HijaParaEscena) => unknown])[] = [
  ['foto', (h) => h.foto_id],
  ['formato', (h) => h.aspecto],
  ['diseño', (h) => h.plantilla],
  ['fondo', (h) => h.fondo],
  ['indicaciones', (h) => h.datos.indicaciones ?? ''],
]

/** ¿Las hijas piden la misma escena? Si no, qué campos difieren (en orden fijo). */
export function compartenEscena(hijas: readonly HijaParaEscena[]): ResultadoEscena {
  const primera = hijas[0]
  if (!primera) return { ok: true }
  const difieren = CAMPOS.filter(([, leer]) => hijas.some((h) => leer(h) !== leer(primera))).map(([nombre]) => nombre)
  return difieren.length === 0 ? { ok: true } : { ok: false, difieren }
}

/**
 * ¿Esta generación puede ser la escena de esta promoción? Sí si es suya, o si es
 * de la tanda de la que la promoción es hija. Una promoción suelta no acepta
 * escenas de tanda, y una hija no acepta las de OTRA tanda.
 */
export function escenaEsDe(
  gen: { readonly promocion_id: string | null; readonly tanda_id?: string | null } | null,
  promo: { readonly id: string; readonly tanda_id: string | null },
): boolean {
  if (!gen) return false
  if (gen.promocion_id === promo.id) return true
  return promo.tanda_id !== null && (gen.tanda_id ?? null) === promo.tanda_id
}
