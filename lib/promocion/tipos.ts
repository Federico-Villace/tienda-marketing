/**
 * Tipos de la promoción paso a paso (ADR-027). Una promoción es un BORRADOR
 * mutable que el wizard va completando; lo que se aprobó queda aparte, en una
 * aprobación inmutable (snapshot).
 */

import type { AspectoFoto } from '../productor/ediciones.ts'

export const MONEDAS = ['ARS', 'USD'] as const
export type Moneda = (typeof MONEDAS)[number]

export const TIPOS_PROMO = ['contado', 'cuotas', 'credito', 'oferta', 'ninguna'] as const
export type TipoPromo = (typeof TIPOS_PROMO)[number]

export type Precio = { moneda: Moneda; monto: number }

/** Lo que la persona cargó en el paso 1 (se guarda tal cual en promociones.datos). */
export type DatosPromocion = {
  precio: Precio
  promo: { tipo: TipoPromo; detalle: string }
  lugar: string
  indicaciones: string
}

/** Una de las 3 opciones del redactor, o el texto elegido y editado a mano. */
export type CopyPromo = {
  titular: string
  hook: string
  copy: string
  /** Cada uno con '#'. */
  hashtags: string[]
  cta: string
  altText: string
}

export type EstadoPromocion = 'borrador' | 'aprobada' | 'descartada'

export type PromocionVista = {
  id: string
  estado: EstadoPromocion
  /** Concurrencia optimista: se manda de vuelta en cada cambio. */
  revision: number
  marcaId: string
  modelo: string
  datos: DatosPromocion
  fotoId: string
  aspecto: AspectoFoto
  plantilla: string | null
  fondo: string | null
  analisisId: string | null
  textosId: string | null
  copy: CopyPromo | null
  copyOpcion: number | null
  copyEditado: boolean
  titular: string | null
  escenaCreativoId: string | null
  /** Hay una placa final vigente en Storage (la ruta no sale del servidor). */
  placaLista: boolean
  creadoEn: string
  actualizadoEn: string
  /** Derivado de lo que ya está cargado: ver paso.ts. */
  pasoActual: number
}

/** La fila tal como la devuelve PostgREST. */
export type FilaPromocion = {
  id: string
  organizacion_id: string
  estado: EstadoPromocion
  revision: number
  marca_id: string
  modelo: string
  datos: DatosPromocion
  foto_id: string
  aspecto: AspectoFoto
  plantilla: string | null
  fondo: string | null
  analisis_id: string | null
  textos_id: string | null
  copy: CopyPromo | null
  copy_opcion: number | null
  copy_editado: boolean
  titular: string | null
  escena_creativo_id: string | null
  placa_ruta: string | null
  placa_hash: string | null
  creado_en: string
  actualizado_en: string
}

export const COLUMNAS_PROMOCION =
  'id,organizacion_id,estado,revision,marca_id,modelo,datos,foto_id,aspecto,plantilla,fondo,analisis_id,textos_id,copy,copy_opcion,copy_editado,titular,escena_creativo_id,placa_ruta,placa_hash,creado_en,actualizado_en'

export type AprobacionVista = {
  id: string
  version: number
  aprobadoEn: string
  aprobadoPor: string
}

/** Los diseños de placa (ver plantillas.ts). Viven acá para validar sin importar el render. */
export const IDS_PLANTILLA = ['oferta_abajo', 'oferta_arriba', 'catalogo'] as const
export type IdPlantilla = (typeof IDS_PLANTILLA)[number]
export const esPlantilla = (x: unknown): x is IdPlantilla => typeof x === 'string' && (IDS_PLANTILLA as readonly string[]).includes(x)

/** Fondos que puede pedir una promoción: son las ediciones de foto que cambian la escena. */
export const FONDOS = ['fondo_estudio', 'escenario_urbano', 'escenario_ruta'] as const
export type IdFondo = (typeof FONDOS)[number]
export const esFondo = (x: unknown): x is IdFondo => typeof x === 'string' && (FONDOS as readonly string[]).includes(x)

/** En qué tercio de la imagen va el texto: la escena de Gemini lo deja libre. */
export type ZonaTexto = 'arriba' | 'abajo'
export const ZONAS: Record<IdPlantilla, ZonaTexto> = {
  oferta_abajo: 'abajo',
  oferta_arriba: 'arriba',
  catalogo: 'abajo',
}
