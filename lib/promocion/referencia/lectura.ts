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
