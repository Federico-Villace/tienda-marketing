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
  readonly id: string
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
  readonly publicadoEn: Date
  readonly vistas: number
  readonly meGusta: number
  readonly comentarios: number
  readonly compartidos: number
  readonly guardados: number
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
