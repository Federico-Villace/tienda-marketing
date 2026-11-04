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
  /** Mediana de vistas mínima de una cuenta para compararse: debajo, los cocientes no significan nada. */
  medianaMinimaVistas: 100,
  /** Desde acá "N× lo habitual" se muestra como "más de N×". */
  TOPE_VECES: 20,
  /**
   * Un post con más de N× la mediana de vistas de su cuenta no es "contenido que
   * funcionó": casi seguro tuvo plata atrás desde una cuenta publicitaria que no vemos
   * (ADR-035). Sale del ranking y de la base de comparación.
   */
  topeAtipico: 20,
  INDICE_MEJOR: 1.2,
  INDICE_PEOR: 0.8,
  TOP: 3,
  /** Filas por lado en las tablas del tablero (al LLM siguen yendo TOP). */
  TOP_TABLA: 5,
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
  /** Todas las elegibles, de mejor a peor: para "Ver todas". Solo se muestra, no va al LLM. */
  readonly ordenadas: readonly CampaniaDestacada[]
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
export function partir<T>(ordenadas: readonly T[], top: number = UMBRALES.TOP): { mejores: T[]; peores: T[] } {
  const n = ordenadas.length
  if (n < 2) return { mejores: [], peores: [] }
  const k = n >= top * 2 ? top : Math.ceil(n / 2)
  const p = n >= top * 2 ? top : n - k
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
        ordenadas: elegidas.map(dest),
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

const veces = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })

/** "2,4×" o, pasado el tope, "más de 20×". El valor crudo se conserva: esto es solo para mostrar. */
export const formatearVeces = (n: number): string =>
  n > UMBRALES.TOPE_VECES ? `más de ${UMBRALES.TOPE_VECES}×` : `${veces.format(n)}×`

export type PublicacionDestacada = {
  readonly publicacion: Publicacion
  /** vistas / mediana de vistas de su cuenta. */
  readonly indice: number
  readonly mediana: number
  /** Cuántas publicaciones comparables tiene su cuenta (de ahí sale la confianza). */
  readonly cuenta: number
}

/** Un post fuera de lo normal: más de `topeAtipico` veces la mediana de vistas de su cuenta. */
export type PostAtipico = {
  readonly publicacion: Publicacion
  readonly vistas: number
  /** vistas / mediana orgánica de su cuenta (la de la primera pasada, con él adentro). */
  readonly indice: number
  readonly link: string | null
}

export type DestacadosPublicaciones = {
  readonly mejores: readonly PublicacionDestacada[]
  readonly peores: readonly PublicacionDestacada[]
  /** Todas las comparables, de mayor a menor índice: para "Ver todas". Solo se muestra, no va al LLM. */
  readonly todas: readonly PublicacionDestacada[]
  /** Posts maduros de cuentas con menos de 5: no se rankean. */
  readonly sinComparar: number
  /** Posts con pauta del período (sin historias), por vistas desc. No se comparan con los orgánicos. */
  readonly conPauta: readonly Publicacion[]
  /** Posts de más de `topeAtipico`× lo habitual de su cuenta, por vistas desc. No se rankean ni cuentan en la mediana. */
  readonly atipicos: readonly PostAtipico[]
  /** Posts maduros orgánicos con vistas 0: Meta no dio métricas. No se rankean (siguen en los totales). */
  readonly sinMetricas: number
  /** Cuentas con mediana de vistas por debajo del piso: sus posts no se rankean. */
  readonly cuentasPocasVistas: readonly { readonly marcaId: string; readonly plataforma: Publicacion['plataforma'] }[]
}

const DIA_MS = 24 * 60 * 60 * 1000
const OFFSET_AR_MS = 3 * 60 * 60 * 1000

type Grupo = { readonly normales: Publicacion[]; readonly atipicos: PostAtipico[] }

/**
 * Parte los posts orgánicos maduros de cada cuenta (marca × plataforma) en normales y
 * atípicos. DOS pasadas, no más: (1) la mediana de la cuenta con todos sus posts con
 * métricas; los que pasan de `topeAtipico`× esa mediana son atípicos. (2) Sin ellos, la
 * mediana se recalcula —los boosts no inflan la base— y esa es la que rankea. No se
 * itera hasta que se estabilice: con una pasada alcanza para sacar los boosts grandes,
 * y repetir empezaría a recortar posts legítimos.
 */
function clasificar(ps: readonly Publicacion[], hasta: string) {
  // Fin del día `hasta` en hora de Argentina.
  const fin = Date.parse(`${hasta}T00:00:00Z`) + OFFSET_AR_MS + DIA_MS
  // Un post con plata atrás no es contenido que funcionó: no entra a la mediana,
  // ni al conteo de la cuenta, ni al ranking.
  const maduras = ps.filter((p) => !p.conPauta && p.tipo !== 'historia' && (fin - p.publicadoEn.getTime()) / DIA_MS >= UMBRALES.MADUREZ_DIAS)
  const conMetricas = maduras.filter((p) => (p.vistas ?? 0) > 0)

  const cuentas = new Map<string, Publicacion[]>()
  for (const p of conMetricas) {
    const k = `${p.marcaId}|${p.plataforma}`
    cuentas.set(k, [...(cuentas.get(k) ?? []), p])
  }

  const grupos: Grupo[] = []
  for (const delaCuenta of cuentas.values()) {
    const med1 = mediana(delaCuenta.map((p) => p.vistas))
    // Sin base confiable (pocos posts o mediana ínfima) no hay "lo habitual" contra qué medir.
    if (delaCuenta.length < UMBRALES.MIN_POSTS_CUENTA || med1 < UMBRALES.medianaMinimaVistas) {
      grupos.push({ normales: delaCuenta, atipicos: [] })
      continue
    }
    const atipicos: PostAtipico[] = []
    const normales: Publicacion[] = []
    for (const p of delaCuenta) {
      if (p.vistas > UMBRALES.topeAtipico * med1) atipicos.push({ publicacion: p, vistas: p.vistas, indice: p.vistas / med1, link: p.permalink })
      else normales.push(p)
    }
    grupos.push({ normales, atipicos })
  }
  return { grupos, sinMetricas: maduras.length - conMetricas.length }
}

/** Los posts de `ps` sin los atípicos (los pagos y lo demás quedan como vienen) y los atípicos aparte. */
export function separarAtipicos(ps: readonly Publicacion[], hasta: string): { sinAtipicos: Publicacion[]; atipicos: Publicacion[] } {
  const atipicos = new Set(clasificar(ps, hasta).grupos.flatMap((g) => g.atipicos.map((a) => a.publicacion)))
  return { sinAtipicos: ps.filter((p) => !atipicos.has(p)), atipicos: ps.filter((p) => atipicos.has(p)) }
}

export function destacarPublicaciones(ps: readonly Publicacion[], hasta: string): DestacadosPublicaciones {
  const conPauta = ps
    .filter((p) => p.conPauta && p.tipo !== 'historia')
    .sort((a, b) => b.vistas - a.vistas)
  const { grupos, sinMetricas } = clasificar(ps, hasta)

  const con: PublicacionDestacada[] = []
  let sinComparar = 0
  const cuentasPocasVistas: { marcaId: string; plataforma: Publicacion['plataforma'] }[] = []
  for (const { normales } of grupos) {
    if (normales.length < UMBRALES.MIN_POSTS_CUENTA) {
      sinComparar += normales.length
      continue
    }
    const med = mediana(normales.map((p) => p.vistas))
    if (med < UMBRALES.medianaMinimaVistas) {
      cuentasPocasVistas.push({ marcaId: normales[0]!.marcaId, plataforma: normales[0]!.plataforma })
      continue
    }
    for (const p of normales) con.push({ publicacion: p, indice: p.vistas / med, mediana: med, cuenta: normales.length })
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
    todas: [...con].sort((a, b) => b.indice - a.indice),
    sinComparar,
    conPauta,
    atipicos: grupos.flatMap((g) => g.atipicos).sort((a, b) => b.vistas - a.vistas),
    sinMetricas,
    cuentasPocasVistas,
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

/**
 * Solo orgánico: los anuncios no informan formato, y ni los posts con pauta, ni los
 * atípicos, ni los que no tienen métricas se comparan (igual criterio que el ranking).
 */
export function rendimientoPorFormato(ps: readonly Publicacion[], hasta: string): FormatoRendimiento[] {
  const { sinAtipicos } = separarAtipicos(ps, hasta)
  const filas = agruparPorTipo(sinAtipicos.filter((p) => !p.conPauta && (p.vistas ?? 0) > 0))
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

