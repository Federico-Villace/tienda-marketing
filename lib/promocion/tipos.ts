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
  /** Lo que la persona pidió para el fondo de la escena (≤300), o null. */
  fondoDescripcion: string | null
  posicionMoto: PosicionMoto
  /** Una línea más en la placa (ej. "Hot Sale · Solo este fin de semana"), o null. */
  lineaExtra: string | null
  /** Foto de inspiración (estilo, luz, ambiente), o null. */
  inspiracionFotoId: string | null
  escenaCreativoId: string | null
  /** Hay una placa final vigente en Storage (la ruta no sale del servidor). */
  placaLista: boolean
  /** Null = suelta; si no, la tanda de la que es hija. */
  tandaId: string | null
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
  fondo_descripcion: string | null
  posicion_moto: PosicionMoto
  linea_extra: string | null
  inspiracion_foto_id: string | null
  escena_creativo_id: string | null
  placa_ruta: string | null
  placa_hash: string | null
  /** Null = promoción suelta; si no, es una de las hijas de una tanda (ADR-028). */
  tanda_id: string | null
  creado_en: string
  actualizado_en: string
}

export const COLUMNAS_PROMOCION =
  'id,organizacion_id,estado,revision,marca_id,modelo,datos,foto_id,aspecto,plantilla,fondo,analisis_id,textos_id,copy,copy_opcion,copy_editado,titular,fondo_descripcion,posicion_moto,linea_extra,inspiracion_foto_id,escena_creativo_id,placa_ruta,placa_hash,tanda_id,creado_en,actualizado_en'

export type AprobacionVista = {
  id: string
  version: number
  aprobadoEn: string
  aprobadoPor: string
}

/**
 * Los diseños de placa (ver plantillas.ts) = ESTILO × DÓNDE VA EL TEXTO. Se guardan en
 * UNA columna (`plantilla`) para no tener dos fuentes de verdad: la pantalla muestra dos
 * controles y compone el id con plantillaDe(). Los tres ids de siempre siguen valiendo.
 * Viven acá para validar sin importar el render.
 */
export const IDS_PLANTILLA = ['oferta_abajo', 'oferta_arriba', 'oferta_costado', 'catalogo', 'catalogo_arriba', 'catalogo_costado'] as const
export type IdPlantilla = (typeof IDS_PLANTILLA)[number]
export const esPlantilla = (x: unknown): x is IdPlantilla => typeof x === 'string' && (IDS_PLANTILLA as readonly string[]).includes(x)

/** degradado: se funde con la foto; solido: un panel liso detrás del texto. */
export type EstiloPlaca = 'degradado' | 'solido'
export const ESTILOS_PLACA = ['degradado', 'solido'] as const
export const POSICIONES_TEXTO = ['arriba', 'abajo', 'costado'] as const
export type PosicionTexto = (typeof POSICIONES_TEXTO)[number]

const PARTES: Record<IdPlantilla, { estilo: EstiloPlaca; posicion: PosicionTexto }> = {
  oferta_abajo: { estilo: 'degradado', posicion: 'abajo' },
  oferta_arriba: { estilo: 'degradado', posicion: 'arriba' },
  oferta_costado: { estilo: 'degradado', posicion: 'costado' },
  catalogo: { estilo: 'solido', posicion: 'abajo' },
  catalogo_arriba: { estilo: 'solido', posicion: 'arriba' },
  catalogo_costado: { estilo: 'solido', posicion: 'costado' },
}
export const estiloDe = (id: IdPlantilla): EstiloPlaca => PARTES[id].estilo
export const posicionTextoDe = (id: IdPlantilla): PosicionTexto => PARTES[id].posicion
export const plantillaDe = (estilo: EstiloPlaca, posicion: PosicionTexto): IdPlantilla =>
  IDS_PLANTILLA.find((id) => PARTES[id].estilo === estilo && PARTES[id].posicion === posicion)!

/** Dónde queda la moto en la imagen que genera Gemini. */
export const POSICIONES_MOTO = ['izquierda', 'centro', 'derecha'] as const
export type PosicionMoto = (typeof POSICIONES_MOTO)[number]
export const esPosicionMoto = (x: unknown): x is PosicionMoto => typeof x === 'string' && (POSICIONES_MOTO as readonly string[]).includes(x)

/**
 * Fondos que puede pedir una promoción: las ediciones de foto que cambian la escena, más
 * "solo mi descripción" (sin fondo armado: el fondo sale de lo que escribió la persona y de
 * la foto de inspiración). La columna es texto libre (≤ 40): no hace falta migración.
 */
export const FONDO_SOLO_DESCRIPCION = 'solo_descripcion'
export const FONDOS = ['fondo_estudio', 'escenario_urbano', 'escenario_ruta', FONDO_SOLO_DESCRIPCION] as const
export type IdFondo = (typeof FONDOS)[number]
export const esFondo = (x: unknown): x is IdFondo => typeof x === 'string' && (FONDOS as readonly string[]).includes(x)

/** Qué sector de la imagen queda libre para el texto: la escena de Gemini lo deja despejado. */
export type ZonaTexto = 'arriba' | 'abajo' | 'izquierda' | 'derecha'

/**
 * Arriba y abajo no dependen de la moto. Al costado el texto va del lado OPUESTO a la
 * moto (con la moto al centro no hay lado: combinacionValida lo rechaza, y acá queda
 * a la derecha para no romper una vista previa a medio editar).
 */
export function zonaDe(plantilla: IdPlantilla, moto: PosicionMoto): ZonaTexto {
  const posicion = posicionTextoDe(plantilla)
  if (posicion !== 'costado') return posicion
  return moto === 'derecha' ? 'izquierda' : 'derecha'
}

export const MENSAJE_COSTADO_SIN_LADO = 'Si el texto va al costado, la moto tiene que ir a la izquierda o a la derecha.'

/** Sin diseño elegido todavía no hay conflicto posible. */
export const combinacionValida = (plantilla: IdPlantilla | null, moto: PosicionMoto): boolean =>
  !(plantilla !== null && posicionTextoDe(plantilla) === 'costado' && moto === 'centro')
