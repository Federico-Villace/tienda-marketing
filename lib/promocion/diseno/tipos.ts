/**
 * Los datos de diseño de una placa de diseño (impactante, deportiva, editorial). Viven en
 * `promociones.diseno` (jsonb, null = todo por defecto). Solo guardan lo que la persona tocó;
 * `resolverDiseno` (defaults.ts) lo completa. Nada de esto cobra ni toca la escena: cambia
 * lo que dibuja la placa, que es gratis.
 */

import type { IdFuente, RolTexto } from '../fuentes-placa.ts'

/** 'original' es solo de la plantilla 'referencia': el acento que se leyó de la foto (su color vive en la plantilla leída). */
export const ACENTOS = ['azul', 'verde', 'rojo', 'naranja', 'amarillo', 'original'] as const
export type Acento = (typeof ACENTOS)[number]

/** Lista cerrada: evita texto libre (y teléfonos o precios) en el pie de la placa. */
export const CTAS = ['Consultanos', 'Escribinos por WhatsApp', 'Pedí tu test ride', 'Vení a verla'] as const
export type Cta = (typeof CTAS)[number]

export const POSICIONES_FRASE = ['izquierda', 'derecha'] as const
export type PosicionFrase = (typeof POSICIONES_FRASE)[number]

/** Inclinaciones posibles de cada texto grande, en grados (CSS rotate: positivo = sentido horario). Lista cerrada: el ajuste de tamaño las cuenta. */
export const INCLINACIONES = [-10, -5, 0, 5, 10] as const
export type Inclinacion = (typeof INCLINACIONES)[number]

/** Lo que cada plantilla hace sola: todo recto, salvo la frase manuscrita de la impactante (rotate(-6deg), desde siempre). */
export const INCLINACION_POR_DEFECTO: Record<string, Record<RolTexto, number>> = {
  impactante_textura: { modelo: 0, frase: -6, precio: 0 },
  deportiva: { modelo: 0, frase: 0, precio: 0 },
  editorial: { modelo: 0, frase: 0, precio: 0 },
  /** Estático: lo leído de la foto lo pone resolverDiseno (la inclinación de cada texto sale de la plantilla leída). */
  referencia: { modelo: 0, frase: 0, precio: 0 },
}

/** Cuántas distribuciones ("Otra variación") tiene cada plantilla; la 0 es la de siempre. */
export const VARIACIONES_POR_PLANTILLA = { impactante_textura: 3, deportiva: 3, editorial: 3, referencia: 2 } as const

export type Condicion = { texto: string; destacado: string }
export type Tamanos = { modelo: number; frase: number; precio: number }

export const LIMITES_DISENO = {
  CONDICION_TEXTO: 22,
  CONDICION_DESTACADO: 18,
  FRASE: 28,
  LISTA_ITEMS: 3,
  LISTA_ITEM: 14,
  NUMERO: 4,
  TAMANO_MIN: -2,
  TAMANO_MAX: 2,
} as const

/** Lo que se guarda: todo opcional. */
export type Diseno = {
  acento?: Acento
  mostrarPrecio?: boolean
  condicion?: Condicion
  cta?: Cta
  frase?: string
  lista?: string[]
  numero?: string
  tamanos?: Partial<Tamanos>
  /** Qué fuente lleva cada texto grande; lo que falta usa la de la plantilla. Cada una tiene que estar en la lista de SU rol. */
  fuentes?: Partial<Record<RolTexto, IdFuente>>
  /** Inclinación (grados) de cada texto grande; lo que falta usa la de la plantilla (0, salvo la frase de la impactante). */
  inclinacion?: Partial<Record<RolTexto, Inclinacion>>
  /** "Otra variación": 0..N-1 (N según la plantilla), 0 = la distribución de siempre. */
  variacion?: number
  posicionFrase?: PosicionFrase
  /** Id de un logo de marca (rol 'marca-moto') del manifiesto de la concesionaria, o null = ninguno. */
  logoMarca?: string | null
}

/** Lo que dibuja la placa: sin huecos. */
export type DisenoResuelto = {
  acento: Acento
  mostrarPrecio: boolean
  condicion: Condicion
  cta: Cta
  frase: string
  lista: string[]
  numero: string
  tamanos: Tamanos
  fuentes: Record<RolTexto, IdFuente>
  /** Grados (puede ser −6: la frase de la impactante viene así de fábrica). */
  inclinacion: Record<RolTexto, number>
  variacion: number
  posicionFrase: PosicionFrase
  logoMarca: string | null
}
