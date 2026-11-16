/**
 * La lectura de una referencia tal como la ve el resto de la app: la fila de `referencias_diseno` (solo lo que se
 * necesita) y su vista. Una lectura "usable" es una lista (dibuja la plantilla 'referencia') o una inutilizable (cae a
 * una plantilla de siempre); las pendientes y las que fallaron no existen para la pantalla.
 */

import type { Aviso, CodigoAviso, MotivoInutilizable, NombreZona, PlantillaFallback, PlantillaReferencia } from './tipos.ts'
import { MOTIVOS_LECTURA } from './tipos.ts'

export type EstadoLectura = 'pendiente' | 'lista' | 'inutilizable' | 'error'

export type FilaLectura = {
  id: string
  estado: EstadoLectura
  plantilla: PlantillaReferencia | null
  fallback: PlantillaFallback | null
  /** "zona:codigo". */
  avisos: string[] | null
  crudo: { motivo?: unknown } | null
}

export const COLUMNAS_LECTURA = 'id,estado,plantilla,fallback,avisos,crudo'

export type LecturaVista = {
  id: string
  estado: 'lista' | 'inutilizable'
  /** Por qué no sirvió (solo si es inutilizable y se sabe). */
  motivo: Exclude<MotivoInutilizable, 'ok'> | null
  fallback: PlantillaFallback | null
  avisos: Aviso[]
  plantilla: PlantillaReferencia | null
}

const ZONAS: readonly NombreZona[] = ['moto', 'modelo', 'precio', 'condicion', 'frase', 'cta', 'logo']
const CODIGOS: readonly CodigoAviso[] = ['descartada_sin_espacio', 'fuente_sustituida', 'color_corregido', 'caja_corregida', 'moto_agrandada']
const MOTIVOS: readonly string[] = [...MOTIVOS_LECTURA.filter((m) => m !== 'ok'), 'sin_zonas', 'sin_espacio', 'formato_invalido']

export const avisosATexto = (avisos: readonly Aviso[]): string[] => avisos.map((a) => `${a.zona}:${a.codigo}`)

export function avisosDeTexto(textos: readonly string[] | null): Aviso[] {
  const r: Aviso[] = []
  for (const t of textos ?? []) {
    const [zona, codigo] = t.split(':')
    if ((ZONAS as readonly string[]).includes(zona ?? '') && (CODIGOS as readonly string[]).includes(codigo ?? '')) r.push({ zona: zona as NombreZona, codigo: codigo as CodigoAviso })
  }
  return r
}

export function vistaDeLectura(f: FilaLectura | null | undefined): LecturaVista | null {
  if (!f || (f.estado !== 'lista' && f.estado !== 'inutilizable')) return null
  const motivo = typeof f.crudo?.motivo === 'string' && MOTIVOS.includes(f.crudo.motivo) ? (f.crudo.motivo as Exclude<MotivoInutilizable, 'ok'>) : null
  return { id: f.id, estado: f.estado, motivo: f.estado === 'inutilizable' ? motivo : null, fallback: f.fallback, avisos: avisosDeTexto(f.avisos), plantilla: f.estado === 'lista' ? f.plantilla : null }
}

const ZONA_TEXTO: Record<NombreZona, string> = {
  moto: 'la moto',
  modelo: 'el modelo',
  precio: 'el precio',
  condicion: 'la condición',
  frase: 'la frase',
  cta: 'el botón del pie',
  logo: 'un logo',
}

/** Qué se ajustó de la referencia, dicho para la persona (sin códigos). */
export function textoDeAviso(a: Aviso): string {
  const zona = ZONA_TEXTO[a.zona]
  switch (a.codigo) {
    case 'descartada_sin_espacio':
      return `No había lugar para ${zona} con este formato: se omitió.`
    case 'fuente_sustituida':
      return `La letra de ${zona} no está entre las nuestras: usamos la más parecida.`
    case 'color_corregido':
      return `Cambiamos el color de ${zona} para que se lea bien sobre el fondo.`
    case 'caja_corregida':
      return `Acomodamos ${zona} para que entre en la imagen.`
    case 'moto_agrandada':
      return 'Agrandamos la moto: en tu referencia quedaba muy chica.'
  }
}

/** Por qué no se pudo copiar el diseño de la referencia. */
export function textoDeMotivo(m: Exclude<MotivoInutilizable, 'ok'> | null): string {
  switch (m) {
    case 'no_es_placa':
      return 'La foto no parece una placa publicitaria.'
    case 'muy_cargada':
      return 'La foto tiene demasiadas cosas para separar cada bloque.'
    case 'sin_moto':
      return 'No se distingue la moto en la foto.'
    case 'ilegible':
      return 'No se pudo distinguir el diseño de la foto.'
    case 'sin_zonas':
      return 'No se encontró dónde van el modelo y el precio.'
    case 'sin_espacio':
      return 'Los bloques no entran en la imagen sin pisarse.'
    case 'formato_invalido':
      return 'La foto tiene una proporción que no se puede usar.'
    default:
      return 'No se pudo copiar el diseño de la foto.'
  }
}
