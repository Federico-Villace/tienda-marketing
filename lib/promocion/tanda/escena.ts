/**
 * La escena de una tanda (ADR-028). El prompt de la escena NO usa la marca
 * (promptEscena: fondo, zona, formato, moto, descripción, inspiración): si las hijas comparten
 * foto, formato, posición del texto, fondo, descripción, moto e inspiración, la imagen sería la MISMA N veces y se
 * genera una sola (un cobro). La marca va en la placa, que es gratis.
 */

import type { PedidoEscena } from '../escena.ts'
import { esCopiaFiel } from '../copia/tipos.ts'
import { esPlantilla, posicionDeClave, zonaDe, type IdFondo, type IdPlantilla, type PosicionMoto } from '../tipos.ts'
import type { AspectoFoto } from '../../productor/ediciones.ts'

type HijaParaEscena = {
  readonly foto_id: string
  readonly aspecto: string
  readonly plantilla: string | null
  readonly fondo: string | null
  readonly fondo_descripcion: string | null
  readonly posicion_moto: string
  readonly inspiracion_foto_id: string | null
  /** Sin dato = 'ambiente' (lo de siempre). */
  readonly inspiracion_modo?: string
  /** Solo cuenta con la plantilla 'referencia' (ADR-039): de qué lectura salen los colores de la escena. */
  readonly referencia_diseno_id?: string | null
  /** Solo la copia fiel (ADR-040): el hash de los textos que la IA tiene que escribir en ESTA hija (lo calcula quien llama; esta función es pura). */
  readonly textos_copia?: string | null
}

export type ResultadoEscena = { readonly ok: true } | { readonly ok: false; readonly difieren: readonly string[] }

const CAMPOS: readonly (readonly [string, (h: HijaParaEscena) => unknown])[] = [
  ['foto', (h) => h.foto_id],
  ['formato', (h) => h.aspecto],
  // Solo importa dónde va el texto (qué sector queda libre), no el estilo: degradado o panel comparten escena.
  ['posición del texto', (h) => (esPlantilla(h.plantilla) ? posicionDeClave(h.plantilla) : null)],
  ['fondo', (h) => h.fondo],
  ['descripción del fondo', (h) => h.fondo_descripcion ?? ''],
  ['posición de la moto', (h) => h.posicion_moto],
  ['foto de inspiración', (h) => h.inspiracion_foto_id ?? null],
  // Sin foto de inspiración el modo no importa (no hay segunda imagen): cuenta como 'ambiente'.
  ['modo de la inspiración', (h) => (h.inspiracion_foto_id && h.inspiracion_modo === 'diseno' ? 'diseno' : 'ambiente')],
  // El prompt de la escena de la plantilla 'referencia' lleva los colores de SU lectura: otra lectura (o ninguna) es otra imagen.
  ['diseño de la referencia', (h) => (h.plantilla === 'referencia' ? (h.referencia_diseno_id ?? 'sin lectura') : null)],
  // En la copia fiel la IA ESCRIBE los textos: otros textos (o sacar uno) son otra imagen. Una hija que no es copia fiel no aporta nada.
  ['textos de la placa', (h) => (esCopiaFiel(h.plantilla) ? (h.textos_copia ?? 'sin textos') : null)],
]

/** ¿Las hijas piden la misma escena? Si no, qué campos difieren (en orden fijo). */
export function compartenEscena(hijas: readonly HijaParaEscena[]): ResultadoEscena {
  const primera = hijas[0]
  if (!primera) return { ok: true }
  const difieren = CAMPOS.filter(([, leer]) => hijas.some((h) => leer(h) !== leer(primera))).map(([nombre]) => nombre)
  return difieren.length === 0 ? { ok: true } : { ok: false, difieren }
}

const CAMPOS_COPIA: readonly (readonly [string, (h: HijaParaEscena) => unknown])[] = [
  ['foto', (h) => h.foto_id],
  ['formato', (h) => h.aspecto],
  ['foto de inspiración', (h) => h.inspiracion_foto_id ?? null],
]

/**
 * Copia fiel (ADR-040): ¿las piezas piden la misma imagen de entrada? Solo cuentan la moto, el formato y la referencia: no hay fondo ni
 * zona libre que pedir, y los textos distintos no frenan (cada juego de textos es otra imagen: lo resuelve quien llama).
 */
export function compartenCopia(hijas: readonly Pick<HijaParaEscena, 'foto_id' | 'aspecto' | 'inspiracion_foto_id'>[]): ResultadoEscena {
  const primera = hijas[0] as HijaParaEscena | undefined
  if (!primera) return { ok: true }
  const difieren = CAMPOS_COPIA.filter(([, leer]) => hijas.some((h) => leer(h as HijaParaEscena) !== leer(primera))).map(([nombre]) => nombre)
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
  readonly inspiracion_modo?: string
}, referencia?: { readonly colores: readonly string[] }): PedidoEscena {
  // La escena de la plantilla 'referencia' se pide con los colores de su lectura: sin ella no se arma (no se cae al prompt de otra plantilla).
  if (h.plantilla === 'referencia' && !referencia) throw new Error('Falta la lectura de la referencia para pedir la escena.')
  return {
    fondo: h.fondo as IdFondo,
    zona: zonaDe(h.plantilla as IdPlantilla, h.posicion_moto as PosicionMoto),
    aspecto: h.aspecto as AspectoFoto,
    posicionMoto: h.posicion_moto as PosicionMoto,
    descripcion: h.fondo_descripcion,
    conReferencia: h.inspiracion_foto_id !== null,
    ...(h.inspiracion_modo === 'diseno' ? { modoInspiracion: 'diseno' as const } : {}),
    ...(h.plantilla === 'referencia' && referencia ? { referencia: { colores: [...referencia.colores] } } : {}),
  }
}
