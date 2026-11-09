/**
 * Los datos de diseño de una placa de diseño (impactante, deportiva, editorial). Viven en
 * `promociones.diseno` (jsonb, null = todo por defecto). Solo guardan lo que la persona tocó;
 * `resolverDiseno` (defaults.ts) lo completa. Nada de esto cobra ni toca la escena: cambia
 * lo que dibuja la placa, que es gratis.
 */

export const ACENTOS = ['azul', 'verde', 'rojo', 'naranja', 'amarillo'] as const
export type Acento = (typeof ACENTOS)[number]

/** Lista cerrada: evita texto libre (y teléfonos o precios) en el pie de la placa. */
export const CTAS = ['Consultanos', 'Escribinos por WhatsApp', 'Pedí tu test ride', 'Vení a verla'] as const
export type Cta = (typeof CTAS)[number]

export const POSICIONES_FRASE = ['izquierda', 'derecha'] as const
export type PosicionFrase = (typeof POSICIONES_FRASE)[number]

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
  posicionFrase: PosicionFrase
  logoMarca: string | null
}
