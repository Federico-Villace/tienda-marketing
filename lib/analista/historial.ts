/**
 * Historial de análisis. Lo lee el servidor desde page.tsx (los últimos 5);
 * después de analizar el cliente hace router.refresh(), así hay una sola fuente
 * de verdad y no hace falta un GET.
 */

import { agruparPorRaiz } from '../agentes/versiones.ts'
import { seleccionar, type Supabase } from '../supabase/rest.ts'
import { normalizarFiltrosGuardados, type Filtros } from '../datos/filtros.ts'
import { MARCAS } from '../datos/marcas.ts'
import type { EntradaAnalisis } from './entrada.ts'
import { aTextoPlano, enriquecer, validarAnalisisV4, type AnalisisV4, type AnalisisV4Vista } from './estructurado.ts'

export type VersionAnalisis = {
  readonly version: number
  readonly fecha: string
  /** null en la v1: la escribió el agente. */
  readonly autor: string | null
}

export type FormatoAnalisis = 'texto' | 'estructurado'

export type AnalisisVista = {
  readonly id: string
  /**
   * El texto VIGENTE: la última edición, o el original si nadie lo editó. En un análisis
   * estructurado es su versión en texto plano (lo que leen el Estratega y los textos).
   */
  readonly contenido: string
  /** Lo que escribió el modelo; las ediciones nunca lo pisan (en texto plano si es estructurado). */
  readonly original: string
  /** 'texto' = v1..v3 (y los de promoción); 'estructurado' = analista-v4. */
  readonly formato: FormatoAnalisis
  /** La punta del análisis v4 lista para mostrar; null si es texto o el JSON no se pudo leer. */
  readonly estructurado: AnalisisV4Vista | null
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
  /** jsonb tal cual está en la base: filas viejas traen `marcaId`, las nuevas `marcaIds`. */
  filtros: unknown
  /** Filas anteriores a la migración v4 no lo traen: se leen como 'texto'. */
  formato?: FormatoAnalisis
  /** El payload que se le mandó al modelo (solo los estructurados). */
  entrada?: unknown
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

export const COLUMNAS_ANALISIS = 'id,contenido,modelo,costo_usd,tokens_entrada,tokens_salida,creado_en,filtros,formato,entrada'

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
  const entrada = x.formato === 'estructurado' ? entradaLegible(x.entrada) : null
  const vigente = entrada ? leerEstructurado(punta.contenido, entrada) : null
  const original = entrada ? leerEstructurado(x.contenido, entrada) : null
  return {
    ...vistaBase(x, desdeCache),
    contenido: vigente ? aTextoPlano(vigente) : punta.contenido,
    original: original ? aTextoPlano(original) : x.contenido,
    formato: vigente ? 'estructurado' : 'texto',
    estructurado: vigente && entrada ? enriquecer(vigente, entrada) : null,
    version: punta.version,
    editadoEn: punta.version > 1 ? punta.creadoEn : null,
    editadoPor: punta.autor,
    versiones: orden.map((v) => ({ version: v.version, fecha: v.creadoEn, autor: v.autor })),
  }
}

/** El payload guardado, si tiene la forma mínima para validar contra él. */
export function entradaLegible(x: unknown): EntradaAnalisis | null {
  if (typeof x !== 'object' || x === null) return null
  const o = x as Record<string, unknown>
  const ok =
    Array.isArray(o.hechos) &&
    typeof o.periodo === 'object' && o.periodo !== null &&
    typeof o.filtro === 'object' && o.filtro !== null && Array.isArray((o.filtro as Record<string, unknown>).marcas) &&
    typeof o.organico === 'object' && o.organico !== null &&
    typeof o.destacados === 'object' && o.destacados !== null &&
    typeof o.publicidad === 'object' && o.publicidad !== null
  return ok ? (x as EntradaAnalisis) : null
}

/** El JSON guardado → análisis validado. Si está roto o ya no valida, null: la pantalla cae a texto. */
export function leerEstructurado(contenido: string, entrada: EntradaAnalisis): AnalisisV4 | null {
  try {
    const r = validarAnalisisV4(JSON.parse(contenido), entrada, 'modelo')
    return r.ok ? r.analisis : null
  } catch {
    return null
  }
}

/** Una fila que no se puede leer no rompe el historial: se muestra con la marca por defecto. */
const filtrosIlegibles = (): Filtros => ({ marcaIds: [MARCAS[0]!.id], plataforma: 'todas', desde: '', hasta: '' })

const vistaBase = (x: FilaAnalisis, desdeCache: boolean) => ({
  id: x.id,
  modelo: x.modelo,
  costoUsd: Number(x.costo_usd),
  tokensEntrada: x.tokens_entrada,
  tokensSalida: x.tokens_salida,
  creadoEn: x.creado_en,
  filtros: normalizarFiltrosGuardados(x.filtros) ?? filtrosIlegibles(),
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
      // Los análisis de una promoción (tipo 'promocion') no son del tablero.
      tipo: 'eq.rendimiento',
      order: 'creado_en.desc',
      limit: String(limite),
    },
    f,
  )
  const ediciones = await leerEdiciones(s, filas.map((x) => x.id), f)
  return filas.map((x) => vistaDeFila(x, false, ediciones))
}
