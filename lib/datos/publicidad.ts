/**
 * Publicidad real para el tablero. Lee de Postgres, nunca de Meta: la suma por
 * campaña la hace la función resumen_publicidad (migración 20261013120000).
 *
 * Solo servidor: usa la clave secreta. Hasta que entre el login, la página que
 * lo muestra tiene que estar detrás de Deployment Protection (ADR-014).
 */

import { rpc, seleccionar, type Supabase } from '../supabase/rest.ts'
import { marcaPorId, normalizarTexto, ordenarMarcas, tokenDeMarca } from './marcas.ts'

type Fetch = typeof fetch

export type CampaniaReal = {
  readonly id: string
  readonly nombre: string
  readonly cuenta: string
  readonly objetivo: string | null
  readonly estado: string | null
  readonly gasto: number
  readonly impresiones: number
  readonly clics: number
  readonly resultados: number
  readonly dias: number
  readonly ultimoDia: string | null
}

export type UltimaSync = {
  readonly estado: 'corriendo' | 'ok' | 'parcial' | 'error'
  readonly terminadaEn: string | null
  readonly error: string | null
}

export type Publicidad = {
  readonly campanias: readonly CampaniaReal[]
  readonly ultimaSync: UltimaSync | null
}

type FilaResumen = {
  campania_id: string
  campania: string
  cuenta: string
  objetivo: string | null
  estado: string | null
  gasto: number | string
  impresiones: number | string
  clics: number | string
  resultados: number | string
  dias: number
  ultimo_dia: string | null
}

export async function leerPublicidad(
  s: Supabase,
  organizacionId: string,
  desde: string,
  f: Fetch,
  /** Tope superior inclusive (YYYY-MM-DD). Sin él, hasta hoy. */
  hasta?: string,
): Promise<Publicidad> {
  const [filas, corridas] = await Promise.all([
    rpc<FilaResumen[]>(s, 'resumen_publicidad', { p_organizacion: organizacionId, p_desde: desde, ...(hasta ? { p_hasta: hasta } : {}) }, f),
    seleccionar<{ estado: UltimaSync['estado']; terminada_en: string | null; error: string | null }>(
      s,
      'sincronizaciones',
      {
        select: 'estado,terminada_en,error',
        organizacion_id: `eq.${organizacionId}`,
        tipo: 'eq.campanias',
        order: 'iniciada_en.desc',
        limit: '1',
      },
      f,
    ),
  ])

  const ultima = corridas[0]
  return {
    campanias: filas.map((x) => ({
      id: x.campania_id,
      nombre: x.campania,
      cuenta: x.cuenta,
      objetivo: x.objetivo,
      estado: x.estado,
      gasto: Number(x.gasto),
      impresiones: Number(x.impresiones),
      clics: Number(x.clics),
      resultados: Number(x.resultados),
      dias: x.dias,
      ultimoDia: x.ultimo_dia,
    })),
    ultimaSync: ultima
      ? { estado: ultima.estado, terminadaEn: ultima.terminada_en, error: ultima.error }
      : null,
  }
}

export function totalesPublicidad(campanias: readonly CampaniaReal[]) {
  const suma = (k: 'gasto' | 'impresiones' | 'clics' | 'resultados') =>
    campanias.reduce((t, c) => t + c[k], 0)
  const gasto = suma('gasto')
  const resultados = suma('resultados')
  return {
    campanias: campanias.length,
    gasto,
    impresiones: suma('impresiones'),
    clics: suma('clics'),
    resultados,
    costoPorResultado: resultados > 0 ? gasto / resultados : null,
  }
}

type Totales = { campanias: number; gasto: number; impresiones: number; clics: number; resultados: number }

const sumarCampanias = (cs: readonly CampaniaReal[]): Totales => {
  const t = totalesPublicidad(cs)
  return { campanias: t.campanias, gasto: t.gasto, impresiones: t.impresiones, clics: t.clics, resultados: t.resultados }
}

export type AtribucionPublicidad = {
  /** Solo campañas que nombran a UNA de las marcas elegidas; orden de MARCAS. */
  readonly porMarca: readonly ({ readonly marcaId: string } & Totales)[]
  /** Campañas que nombran a 2+ marcas elegidas: se cuentan una sola vez, acá. */
  readonly compartidas: number
  readonly compartidasTotales: Totales
  /** Ninguna de las marcas elegidas aparece en el nombre. */
  readonly sinAtribuir: Totales
}

/**
 * Hay UNA cuenta publicitaria para las 7 marcas: la marca de una campaña se
 * deduce del texto de su NOMBRE (ADR-027, R14). Es aproximado y se dice así.
 * Sin doble conteo: gasto de filas + compartidas + sin atribuir = gasto total.
 */
export function atribuirCampanias(campanias: readonly CampaniaReal[], marcaIds: readonly string[]): AtribucionPublicidad {
  const elegidas = ordenarMarcas(marcaIds).map((id) => ({ id, token: tokenDeMarca(marcaPorId(id)!) }))
  const porMarca = new Map<string, CampaniaReal[]>(elegidas.map((m) => [m.id, []]))
  const compartidas: CampaniaReal[] = []
  const sinAtribuir: CampaniaReal[] = []

  for (const c of campanias) {
    const nombre = normalizarTexto(c.nombre)
    const dueñas = elegidas.filter((m) => nombre.includes(m.token))
    if (dueñas.length === 0) sinAtribuir.push(c)
    else if (dueñas.length === 1) porMarca.get(dueñas[0]!.id)!.push(c)
    else compartidas.push(c)
  }

  return {
    porMarca: elegidas.map((m) => ({ marcaId: m.id, ...sumarCampanias(porMarca.get(m.id)!) })),
    compartidas: compartidas.length,
    compartidasTotales: sumarCampanias(compartidas),
    sinAtribuir: sumarCampanias(sinAtribuir),
  }
}
