/**
 * Historial de análisis. Lo lee el servidor desde page.tsx (los últimos 5);
 * después de analizar el cliente hace router.refresh(), así hay una sola fuente
 * de verdad y no hace falta un GET.
 */

import { agruparPorRaiz } from '../agentes/versiones.ts'
import { seleccionar, type Supabase } from '../supabase/rest.ts'
import type { Filtros } from '../datos/filtros.ts'

export type VersionAnalisis = {
  readonly version: number
  readonly fecha: string
  /** null en la v1: la escribió el agente. */
  readonly autor: string | null
}

export type AnalisisVista = {
  readonly id: string
  /** El texto VIGENTE: la última edición, o el original si nadie lo editó. */
  readonly contenido: string
  /** Lo que escribió el modelo; las ediciones nunca lo pisan. */
  readonly original: string
  /** Última versión (1 = sin editar). Es la que hay que mandar al editar. */
  readonly version: number
  readonly editadoEn: string | null
  readonly editadoPor: string | null
  /** De la más nueva a la más vieja. */
  readonly versiones: readonly VersionAnalisis[]
  readonly modelo: string
  readonly costoUsd: number
  readonly tokensEntrada: number
  readonly tokensSalida: number
  readonly creadoEn: string
  readonly filtros: Filtros
  /** true = se reutilizó uno guardado: este pedido no costó nada. */
  readonly desdeCache: boolean
}

export type FilaAnalisis = {
  id: string
  contenido: string
  modelo: string
  costo_usd: number | string
  tokens_entrada: number
  tokens_salida: number
  creado_en: string
  filtros: Filtros
}

/** Una edición humana (v2 en adelante) de un análisis. El original vive en `analisis`. */
export type FilaEdicion = {
  id: string
  analisis_id: string
  version: number
  contenido: string
  editado_por: string | null
  editado_en: string
}

export const COLUMNAS_EDICION = 'id,analisis_id,version,contenido,editado_por,editado_en'

export const COLUMNAS_ANALISIS = 'id,contenido,modelo,costo_usd,tokens_entrada,tokens_salida,creado_en,filtros'

type Version = { id: string; raizId: string; version: number; estado: string; creadoEn: string; contenido: string; autor: string | null }

export function vistaDeFila(x: FilaAnalisis, desdeCache = false, ediciones: readonly FilaEdicion[] = []): AnalisisVista {
  // Mismo agrupador que planes y piezas: la raíz es el análisis, la vigente es la última versión.
  const versiones: Version[] = [
    { id: x.id, raizId: x.id, version: 1, estado: 'original', creadoEn: x.creado_en, contenido: x.contenido, autor: null },
    ...ediciones
      .filter((e) => e.analisis_id === x.id)
      .map((e) => ({ id: e.id, raizId: x.id, version: e.version, estado: 'edicion', creadoEn: e.editado_en, contenido: e.contenido, autor: e.editado_por })),
  ]
  const { punta, versiones: orden } = agruparPorRaiz(versiones, () => true)[0]!
  return {
    ...vistaBase(x, desdeCache),
    contenido: punta.contenido,
    original: x.contenido,
    version: punta.version,
    editadoEn: punta.version > 1 ? punta.creadoEn : null,
    editadoPor: punta.autor,
    versiones: orden.map((v) => ({ version: v.version, fecha: v.creadoEn, autor: v.autor })),
  }
}

const vistaBase = (x: FilaAnalisis, desdeCache: boolean) => ({
  id: x.id,
  modelo: x.modelo,
  costoUsd: Number(x.costo_usd),
  tokensEntrada: x.tokens_entrada,
  tokensSalida: x.tokens_salida,
  creadoEn: x.creado_en,
  filtros: x.filtros,
  desdeCache,
})

export async function leerEdiciones(s: Supabase, analisisIds: readonly string[], f: typeof fetch): Promise<FilaEdicion[]> {
  if (analisisIds.length === 0) return []
  return seleccionar<FilaEdicion>(
    s,
    'ediciones_analisis',
    { select: COLUMNAS_EDICION, analisis_id: `in.(${analisisIds.join(',')})`, order: 'version.asc' },
    f,
  )
}

export async function leerHistorial(
  s: Supabase,
  organizacionId: string,
  limite: number,
  f: typeof fetch,
): Promise<AnalisisVista[]> {
  const filas = await seleccionar<FilaAnalisis>(
    s,
    'analisis',
    {
      select: COLUMNAS_ANALISIS,
      organizacion_id: `eq.${organizacionId}`,
      order: 'creado_en.desc',
      limit: String(limite),
    },
    f,
  )
  const ediciones = await leerEdiciones(s, filas.map((x) => x.id), f)
  return filas.map((x) => vistaDeFila(x, false, ediciones))
}
