/**
 * Tipos del dominio.
 *
 * Son los que viajan desde la capa 1 (ingesta) hacia el tablero y hacia los
 * agregados que come el Analista. No reflejan la forma cruda de Meta: eso vive
 * en la columna `crudo` de cada tabla.
 */

export type Plataforma = 'instagram' | 'facebook'

export type TipoPublicacion =
  | 'imagen'
  | 'video'
  | 'carrusel'
  | 'reel'
  | 'historia'

export type Marca = {
  /** Id de la página de Facebook. */
  readonly id: string
  /** Id de la cuenta de Instagram vinculada a la página. */
  readonly igId: string
  readonly nombre: string
  readonly usuarioIg: string
  readonly paginaFb: string
}

export type Publicacion = {
  readonly id: string
  readonly marcaId: string
  readonly plataforma: Plataforma
  readonly tipo: TipoPublicacion
  readonly texto: string
  /** Link público al post en Meta; null si Meta no lo informó. */
  readonly permalink: string | null
  readonly publicadoEn: Date
  readonly vistas: number
  /** null = Meta no lo informa (los posts de Facebook no traen alcance). */
  readonly alcance: number | null
  /** null = Meta no lo informa (Instagram no da clics por publicación). */
  readonly clics: number | null
  readonly meGusta: number
  readonly comentarios: number
  readonly compartidos: number
  readonly guardados: number
  /**
   * El post tiene un anuncio detrás (boost o pauta). Sus vistas mezclan orgánico y
   * pago, así que no se compara con los orgánicos. Ausente = orgánico.
   */
  readonly conPauta?: boolean
  /** Nombre de la campaña del anuncio más reciente, si se conoce. */
  readonly campaniaPauta?: string | null
}

export type Campania = {
  readonly id: string
  readonly marcaId: string
  readonly nombre: string
  readonly objetivo: string
  readonly estado: 'activa' | 'pausada' | 'finalizada'
  readonly gasto: number
  readonly impresiones: number
  readonly clics: number
  readonly conversiones: number
}

/** Suma de todas las formas de interacción de una publicación. */
export const interaccionesDe = (p: Publicacion): number =>
  p.meGusta + p.comentarios + p.compartidos + p.guardados
