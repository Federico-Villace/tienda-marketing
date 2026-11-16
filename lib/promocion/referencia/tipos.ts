/**
 * Tipos de la "plantilla desde la referencia" (ADR-039). La lectura de la foto de inspiración la hace un modelo de
 * visión y es entrada NO CONFIABLE: `LecturaCruda` es lo que sobrevive al parseo estricto (esquema.ts) y
 * `PlantillaReferencia` es lo que queda después de validar y reparar (reparar.ts). Nada de esto tiene texto libre.
 */

import type { Acento } from '../diseno/tipos.ts'
import type { IdFuente } from '../fuentes-placa.ts'
import type { IdPlantillaDiseno } from '../tipos.ts'

/** '#RRGGBB' en mayúsculas. */
export type Hex = string

export const CATEGORIAS_FUENTE = ['condensada', 'gruesa', 'expandida', 'geometrica', 'tecnica', 'stencil', 'manuscrita', 'pincel', 'retro', 'comic', 'serif'] as const
export type CategoriaFuente = (typeof CATEGORIAS_FUENTE)[number]

export const ALINEACIONES = ['izquierda', 'centro', 'derecha'] as const
export type AlineacionRef = (typeof ALINEACIONES)[number]

export const ESTILOS_PRECIO = ['texto', 'pastilla', 'barra'] as const
export type EstiloPrecio = (typeof ESTILOS_PRECIO)[number]

export const MOTIVOS_LECTURA = ['ok', 'no_es_placa', 'muy_cargada', 'sin_moto', 'ilegible'] as const
export type MotivoLectura = (typeof MOTIVOS_LECTURA)[number]

/** Caja relativa a la imagen de la referencia: x, y, w, h en 0..1 (sin clampear todavía). */
export type CajaRel = { x: number; y: number; w: number; h: number }

/** Una zona leída: solo se mira lo que corresponde a su rol; lo demás queda en null. */
export type ZonaCruda = {
  caja: CajaRel
  color: Hex | null
  fuente: CategoriaFuente | null
  alineacion: AlineacionRef | null
  inclinacion: number | null
  mayusculas: boolean | null
  estilo: EstiloPrecio | null
  relleno: Hex | null
}

export type LecturaCruda = {
  utilizable: boolean
  motivo: MotivoLectura
  fondo: { tipo: 'liso' | 'degradado' | 'foto' | null; color: Hex | null; color2: Hex | null; direccion: 'vertical' | 'horizontal' | null }
  acento: Hex | null
  zonas: {
    moto: ZonaCruda | null
    modelo: ZonaCruda | null
    precio: ZonaCruda | null
    condicion: ZonaCruda | null
    frase: ZonaCruda | null
    cta: ZonaCruda | null
    /** 0..2 */
    logos: CajaRel[]
  }
}

/** Caja en px sobre el ancho de referencia (1080). Enteros. */
export type CajaPx = { x: number; y: number; w: number; h: number }

export type ZonaPlantilla = { caja: CajaPx; color: Hex; fuente: IdFuente; alineacion: AlineacionRef }

/** Lo que guarda `referencias_diseno.plantilla` (≤ 4 KB) y lo que dibuja la placa. Sin un solo texto libre. */
export type PlantillaReferencia = {
  /** Siempre 1080. */
  ancho: number
  /** 1080 · altoRef / anchoRef (de fotos.ancho/alto, no del modelo). */
  alto: number
  fondo: { tipo: 'liso' | 'degradado'; color: Hex; color2: Hex | null; direccion: 'vertical' | 'horizontal' }
  acento: Hex
  moto: CajaPx
  modelo: ZonaPlantilla & { mayusculas: boolean; inclinacion: number }
  precio: ZonaPlantilla & { estilo: EstiloPrecio; relleno: Hex | null }
  condicion: ZonaPlantilla | null
  frase: (ZonaPlantilla & { inclinacion: number }) | null
  cta: { caja: CajaPx; color: Hex; relleno: Hex | null } | null
  /** Cajas de los logos (0..2). */
  logos: CajaPx[]
}

export type NombreZona = 'moto' | 'modelo' | 'precio' | 'condicion' | 'frase' | 'cta' | 'logo'
export type CodigoAviso = 'descartada_sin_espacio' | 'fuente_sustituida' | 'color_corregido' | 'caja_corregida' | 'moto_agrandada'
export type Aviso = { zona: NombreZona; codigo: CodigoAviso }

/** Las tres de diseño que existen sin referencia: a una de ellas se cae si la lectura no sirve. */
export type PlantillaFallback = Exclude<IdPlantillaDiseno, 'referencia'>

export type MotivoInutilizable = MotivoLectura | 'sin_zonas' | 'sin_espacio' | 'formato_invalido'

export type ResultadoReparacion =
  | { ok: true; plantilla: PlantillaReferencia; avisos: Aviso[] }
  | { ok: false; motivo: Exclude<MotivoInutilizable, 'ok'>; fallback: PlantillaFallback; /** El acento más cercano al leído dentro de la paleta del fallback (null si no se leyó). */ acento: Acento | null }
