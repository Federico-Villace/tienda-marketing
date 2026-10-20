/**
 * Historial de análisis. Lo lee el servidor desde page.tsx (los últimos 5);
 * después de analizar el cliente hace router.refresh(), así hay una sola fuente
 * de verdad y no hace falta un GET.
 */

import { seleccionar, type Supabase } from '../supabase/rest.ts'
import type { Filtros } from '../datos/filtros.ts'

export type AnalisisVista = {
  readonly id: string
  readonly contenido: string
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

export const COLUMNAS_ANALISIS = 'id,contenido,modelo,costo_usd,tokens_entrada,tokens_salida,creado_en,filtros'

export const vistaDeFila = (x: FilaAnalisis, desdeCache = false): AnalisisVista => ({
  id: x.id,
  contenido: x.contenido,
  modelo: x.modelo,
  costoUsd: Number(x.costo_usd),
  tokensEntrada: x.tokens_entrada,
  tokensSalida: x.tokens_salida,
  creadoEn: x.creado_en,
  filtros: x.filtros,
  desdeCache,
})

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
  return filas.map((x) => vistaDeFila(x))
}
