/**
 * Destacados: "lo que funcionó y lo que no" del tablero. Es TS puro sobre las filas
 * que ya traen resumen_publicidad / resumen_publicaciones: gratis, determinista y
 * sin LLM (ADR-033). La marca de una campaña se deduce del NOMBRE, igual que en
 * atribuirCampanias (ADR-027).
 *
 * Los umbrales son iniciales (se calibran con datos reales de 999 Motos): viven
 * todos acá, en un solo objeto.
 */

import { agruparPorTipo } from './agregados.ts'
import { marcaPorId, normalizarTexto, ordenarMarcas, tokenDeMarca } from './marcas.ts'
import type { CampaniaReal } from './publicidad.ts'
import type { Publicacion, TipoPublicacion } from './tipos.ts'

export const UMBRALES = {
  /** Gasto mínimo (ARS) para que una campaña entre al ranking. */
  MIN_GASTO_ARS: 15000,
  MIN_RESULTADOS: 5,
  MIN_CLICS: 30,
  MIN_IMPRESIONES: 5000,
  /** Días que tiene que tener un post para que sus vistas cuenten. */
  MADUREZ_DIAS: 3,
  /** Posts elegibles que necesita una cuenta para compararse contra sí misma. */
  MIN_POSTS_CUENTA: 5,
  INDICE_MEJOR: 1.2,
  INDICE_PEOR: 0.8,
  TOP: 3,
  /** Un formato con menos posts que esto se muestra atenuado. */
  MIN_POSTS_FORMATO: 5,
} as const

export type MetricaCampania = 'costoPorResultado' | 'costoPorClic' | 'cpm'

const OBJETIVOS_RESULTADO = new Set(['OUTCOME_ENGAGEMENT', 'OUTCOME_LEADS', 'OUTCOME_SALES', 'MESSAGES', 'LEAD_GENERATION', 'CONVERSIONS'])
const OBJETIVOS_CLICS = new Set(['OUTCOME_TRAFFIC', 'LINK_CLICKS'])
const OBJETIVOS_ALCANCE = new Set(['OUTCOME_AWARENESS', 'REACH', 'BRAND_AWARENESS'])

export type MedidaCampania = {
  /** null = no hay con qué compararla (objetivo desconocido y sin muestra). */
  readonly metrica: MetricaCampania | null
  /** Menor = mejor. null si no hay métrica o el denominador es 0. */
  readonly valor: number | null
  readonly muestra: number
  readonly minimo: number
  readonly elegible: boolean
}

const dividir = (a: number, b: number): number | null => (b > 0 ? a / b : null)

/** La métrica que corresponde al OBJETIVO de la campaña: comparar CPC con CPR es mezclar peras con manzanas. */
export function metricaDeCampania(c: CampaniaReal): MedidaCampania {
  const objetivo = (c.objetivo ?? '').toUpperCase()
  let metrica: MetricaCampania | null
  if (OBJETIVOS_RESULTADO.has(objetivo)) metrica = 'costoPorResultado'
  else if (OBJETIVOS_CLICS.has(objetivo)) metrica = 'costoPorClic'
  else if (OBJETIVOS_ALCANCE.has(objetivo)) metrica = 'cpm'
  else if (c.resultados >= UMBRALES.MIN_RESULTADOS) metrica = 'costoPorResultado'
  else if (c.clics >= UMBRALES.MIN_CLICS) metrica = 'costoPorClic'
  else metrica = null

  if (metrica === null) return { metrica, valor: null, muestra: 0, minimo: 0, elegible: false }

  const [valor, muestra, minimo] =
    metrica === 'costoPorResultado'
      ? [dividir(c.gasto, c.resultados), c.resultados, UMBRALES.MIN_RESULTADOS]
      : metrica === 'costoPorClic'
        ? [dividir(c.gasto, c.clics), c.clics, UMBRALES.MIN_CLICS]
        : [dividir(c.gasto * 1000, c.impresiones), c.impresiones, UMBRALES.MIN_IMPRESIONES]

  return { metrica, valor, muestra, minimo, elegible: valor !== null && muestra >= minimo && c.gasto >= UMBRALES.MIN_GASTO_ARS }
}

export type CampaniaDestacada = {
  readonly campania: CampaniaReal
  readonly valor: number
  readonly muestra: number
}

export type GrupoCampanias = {
  readonly metrica: MetricaCampania
  readonly elegibles: number
  /** Menos de 2 elegibles: no hay ranking posible. */
  readonly pocas: boolean
  readonly mejores: readonly CampaniaDestacada[]
  readonly peores: readonly CampaniaDestacada[]
  /** Objetivo de resultados, gasto >= 2×umbral y 0 resultados: encabeza "peores". */
  readonly sinResultados: readonly CampaniaReal[]
}

export type DestacadosCampanias = {
  readonly principal: GrupoCampanias | null
  /** Otras métricas con 2+ elegibles. */
  readonly otras: readonly GrupoCampanias[]
  readonly excluidas: { readonly cantidad: number; readonly motivo: string }
  /** La marca salió del nombre de la campaña (aproximado). */
  readonly atribuidasPorNombre: boolean
}

const ars = new Intl.NumberFormat('es-AR')

export const MOTIVO_EXCLUIDAS =
  `Gastaron menos de ARS ${ars.format(UMBRALES.MIN_GASTO_ARS)} o no llegan a la muestra mínima ` +
  `(${UMBRALES.MIN_RESULTADOS} resultados, ${UMBRALES.MIN_CLICS} clics o ${ars.format(UMBRALES.MIN_IMPRESIONES)} impresiones, según el objetivo)`

/** Sin solapamiento: con menos de 6 elegibles se parte la lista (mejores = la mitad de arriba). */
function partir<T>(ordenadas: readonly T[]): { mejores: T[]; peores: T[] } {
  const n = ordenadas.length
  if (n < 2) return { mejores: [], peores: [] }
  const k = n >= UMBRALES.TOP * 2 ? UMBRALES.TOP : Math.ceil(n / 2)
  const p = n >= UMBRALES.TOP * 2 ? UMBRALES.TOP : n - k
  return { mejores: ordenadas.slice(0, k), peores: ordenadas.slice(n - p).reverse() }
}

const METRICAS: readonly MetricaCampania[] = ['costoPorResultado', 'costoPorClic', 'cpm']

export function destacarCampanias(
  campanias: readonly CampaniaReal[],
  marcaIds: readonly string[],
  /** true = están todas las marcas: no se filtra ni se atribuye por nombre. */
  todas: boolean,
): DestacadosCampanias {
  let alcance = campanias
  if (!todas) {
    const tokens = ordenarMarcas(marcaIds).map((id) => tokenDeMarca(marcaPorId(id)!))
    alcance = campanias.filter((c) => {
      const nombre = normalizarTexto(c.nombre)
      return tokens.some((t) => nombre.includes(t))
    })
  }

  type Elegida = { c: CampaniaReal; valor: number; muestra: number }
  const porMetrica = new Map<MetricaCampania, Elegida[]>()
  const sinRes: CampaniaReal[] = []
  let excluidas = 0

  for (const c of alcance) {
    const m = metricaDeCampania(c)
    if (m.elegible && m.metrica) {
      const l = porMetrica.get(m.metrica) ?? []
      l.push({ c, valor: m.valor!, muestra: m.muestra })
      porMetrica.set(m.metrica, l)
    } else if (
      OBJETIVOS_RESULTADO.has((c.objetivo ?? '').toUpperCase()) &&
      c.resultados === 0 &&
      c.gasto >= UMBRALES.MIN_GASTO_ARS * 2
    ) {
      sinRes.push(c)
    } else {
      excluidas += 1
    }
  }

  const grupos = METRICAS.flatMap((metrica): (GrupoCampanias & { gasto: number })[] => {
    const elegidas = (porMetrica.get(metrica) ?? []).sort((a, b) => a.valor - b.valor)
    const sinResultados = metrica === 'costoPorResultado' ? sinRes : []
    if (elegidas.length === 0 && sinResultados.length === 0) return []
    const { mejores, peores } = partir(elegidas)
    const dest = (e: Elegida): CampaniaDestacada => ({ campania: e.c, valor: e.valor, muestra: e.muestra })
    return [
      {
        metrica,
        elegibles: elegidas.length,
        pocas: elegidas.length < 2,
        mejores: mejores.map(dest),
        peores: peores.map(dest),
        sinResultados,
        gasto: elegidas.reduce((t, e) => t + e.c.gasto, 0),
      },
    ]
  })

  const ordenados = [...grupos].sort((a, b) => b.gasto - a.gasto)
  const quitarGasto = ({ gasto: _g, ...g }: GrupoCampanias & { gasto: number }): GrupoCampanias => g
  const [principal, ...resto] = ordenados

  return {
    principal: principal ? quitarGasto(principal) : null,
    otras: resto.filter((g) => g.elegibles >= 2).map(quitarGasto),
    excluidas: { cantidad: excluidas, motivo: MOTIVO_EXCLUIDAS },
    atribuidasPorNombre: !todas,
  }
}

export function mediana(valores: readonly number[]): number {
  if (valores.length === 0) return 0
  const o = [...valores].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 === 1 ? o[m]! : (o[m - 1]! + o[m]!) / 2
}

export type PublicacionDestacada = {
  readonly publicacion: Publicacion
  /** vistas / mediana de vistas de su cuenta. */
  readonly indice: number
  readonly mediana: number
}

export type DestacadosPublicaciones = {
  readonly mejores: readonly PublicacionDestacada[]
  readonly peores: readonly PublicacionDestacada[]
  /** Posts maduros de cuentas con menos de 5: no se rankean. */
  readonly sinComparar: number
}

const DIA_MS = 24 * 60 * 60 * 1000
const OFFSET_AR_MS = 3 * 60 * 60 * 1000

export function destacarPublicaciones(ps: readonly Publicacion[], hasta: string): DestacadosPublicaciones {
  // Fin del día `hasta` en hora de Argentina.
  const fin = Date.parse(`${hasta}T00:00:00Z`) + OFFSET_AR_MS + DIA_MS
  const maduras = ps.filter((p) => p.tipo !== 'historia' && (fin - p.publicadoEn.getTime()) / DIA_MS >= UMBRALES.MADUREZ_DIAS)

  const cuentas = new Map<string, Publicacion[]>()
  for (const p of maduras) {
    const k = `${p.marcaId}|${p.plataforma}`
    cuentas.set(k, [...(cuentas.get(k) ?? []), p])
  }

  const con: PublicacionDestacada[] = []
  let sinComparar = 0
  for (const delaCuenta of cuentas.values()) {
    const med = mediana(delaCuenta.map((p) => p.vistas))
    if (delaCuenta.length < UMBRALES.MIN_POSTS_CUENTA || med === 0) {
      sinComparar += delaCuenta.length
      continue
    }
    for (const p of delaCuenta) con.push({ publicacion: p, indice: p.vistas / med, mediana: med })
  }

  return {
    mejores: con
      .filter((x) => x.indice >= UMBRALES.INDICE_MEJOR)
      .sort((a, b) => b.indice - a.indice)
      .slice(0, UMBRALES.TOP),
    peores: con
      .filter((x) => x.indice <= UMBRALES.INDICE_PEOR)
      .sort((a, b) => a.indice - b.indice)
      .slice(0, UMBRALES.TOP),
    sinComparar,
  }
}

export type FormatoRendimiento = {
  readonly tipo: TipoPublicacion
  readonly publicaciones: number
  readonly vistasPromedio: number
  /** Interacciones / vistas, en porcentaje. */
  readonly tasaPct: number
  /** Ancho de la barra: el mejor formato es 100. */
  readonly anchoPct: number
  readonly muestraChica: boolean
}

/** Solo orgánico: los anuncios no informan formato. */
export function rendimientoPorFormato(ps: readonly Publicacion[]): FormatoRendimiento[] {
  const filas = agruparPorTipo(ps)
  const techo = Math.max(...filas.map((f) => f.vistasPromedio), 0)
  return filas.map((f) => ({
    tipo: f.clave as TipoPublicacion,
    publicaciones: f.publicaciones,
    vistasPromedio: f.vistasPromedio,
    tasaPct: f.tasaInteraccion * 100,
    anchoPct: techo === 0 ? 0 : Math.round((f.vistasPromedio / techo) * 100),
    muestraChica: f.publicaciones < UMBRALES.MIN_POSTS_FORMATO,
  }))
}

