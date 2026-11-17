/**
 * Varias motos en UNA placa (ADR-041): de 2 a 4 motos, una sola marca. La moto principal (la 1) vive en las columnas de siempre de la
 * promoción (foto_id, modelo, datos.precio y datos.promo) y las otras 1 a 3 en `promociones.motos_extra` (jsonb). Así todo lo que ya lee la
 * promoción (lista, resumen, textos del redactor) sigue andando con la moto 1 y lo nuevo se suma sin tocar lo de una moto sola.
 */

import type { DatosPromocion, FilaPromocion, Precio } from '../tipos.ts'

export const LIMITES_VARIAS = { MOTOS_MIN: 2, MOTOS_MAX: 4, EXTRAS_MIN: 1, EXTRAS_MAX: 3 } as const

/** Una moto de la placa: su foto, su modelo, su precio y su promo (la condición de pago, opcional). */
export type MotoExtra = { fotoId: string; modelo: string; precio: Precio; promo: DatosPromocion['promo'] }
export type MotoDePlaca = MotoExtra

/** ¿Es una placa de varias motos? Solo cuenta una lista con al menos una moto extra. */
export const esVariasMotos = (p: { motos_extra?: unknown }): boolean => Array.isArray(p.motos_extra) && p.motos_extra.length > 0

/** Todas las motos de la placa en orden: la principal primero y las extras detrás. Una promoción de una moto sola da una lista de una. */
export function motosDeLaPlaca(p: Pick<FilaPromocion, 'foto_id' | 'modelo' | 'datos' | 'motos_extra'>): MotoDePlaca[] {
  const extras = Array.isArray(p.motos_extra) ? p.motos_extra : []
  return [{ fotoId: p.foto_id, modelo: p.modelo, precio: p.datos.precio, promo: p.datos.promo }, ...extras]
}

/** Sin una foto de referencia, una placa de varias motos puede salir como una GRILLA de las fotos reales (sin IA, sin costo). */
export const PLANTILLA_GRILLA = 'varias_motos' as const
export const esGrilla = (x: unknown): x is typeof PLANTILLA_GRILLA => x === PLANTILLA_GRILLA
