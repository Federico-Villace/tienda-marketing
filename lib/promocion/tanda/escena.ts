/**
 * La escena de una tanda (ADR-028). El prompt de la escena NO usa la marca
 * (promptEscena: fondo, zona, formato, moto, descripción, inspiración): si las hijas comparten
 * foto, formato, posición del texto, fondo, descripción, moto e inspiración, la imagen sería la MISMA N veces y se
 * genera una sola (un cobro). La marca va en la placa, que es gratis.
 */

import type { PedidoEscena } from '../escena.ts'
import { esPlantilla, posicionTextoDe, zonaDe, type IdFondo, type IdPlantilla, type PosicionMoto } from '../tipos.ts'
import type { AspectoFoto } from '../../productor/ediciones.ts'

type HijaParaEscena = {
  readonly foto_id: string
  readonly aspecto: string
  readonly plantilla: string | null
  readonly fondo: string | null
  readonly fondo_descripcion: string | null
  readonly posicion_moto: string
  readonly inspiracion_foto_id: string | null
}

export type ResultadoEscena = { readonly ok: true } | { readonly ok: false; readonly difieren: readonly string[] }

const CAMPOS: readonly (readonly [string, (h: HijaParaEscena) => unknown])[] = [
  ['foto', (h) => h.foto_id],
  ['formato', (h) => h.aspecto],
  // Solo importa dónde va el texto (qué sector queda libre), no el estilo: degradado o panel comparten escena.
  ['posición del texto', (h) => (esPlantilla(h.plantilla) ? posicionTextoDe(h.plantilla) : null)],
  ['fondo', (h) => h.fondo],
  ['descripción del fondo', (h) => h.fondo_descripcion ?? ''],
  ['posición de la moto', (h) => h.posicion_moto],
  ['foto de inspiración', (h) => h.inspiracion_foto_id ?? null],
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
 * de la tanda de la que la promoción es hija (y, en un lote de motos, de su misma moto). Una promoción suelta no acepta
 * escenas de tanda, y una hija no acepta las de OTRA tanda.
 */
export function escenaEsDe(
  gen: { readonly promocion_id: string | null; readonly tanda_id?: string | null; readonly grupo?: number | null } | null,
  promo: { readonly id: string; readonly tanda_id: string | null; readonly grupo?: number | null },
): boolean {
  if (!gen) return false
  if (gen.promocion_id === promo.id) return true
  if (promo.tanda_id === null || (gen.tanda_id ?? null) !== promo.tanda_id) return false
  // En un lote de motos cada moto tiene SU escena (grupo); sin grupo en ambos es la de siempre.
  return (gen.grupo ?? 0) === (promo.grupo ?? 0)
}

/**
 * El pedido de la escena de un grupo de hijas que ya comparten escena (compartenEscena) y
 * tienen diseño y fondo elegidos: sale de la primera, no del body. La usan la estimación de
 * una tanda de marcas y la de cada moto de un lote (ADR-032).
 */
export function pedidoEscenaDe(h: {
  readonly fondo: string | null
  readonly plantilla: string | null
  readonly aspecto: string
  readonly posicion_moto: string
  readonly fondo_descripcion: string | null
  readonly inspiracion_foto_id: string | null
}): PedidoEscena {
  return {
    fondo: h.fondo as IdFondo,
    zona: zonaDe(h.plantilla as IdPlantilla, h.posicion_moto as PosicionMoto),
    aspecto: h.aspecto as AspectoFoto,
    posicionMoto: h.posicion_moto as PosicionMoto,
    descripcion: h.fondo_descripcion,
    conReferencia: h.inspiracion_foto_id !== null,
  }
}
