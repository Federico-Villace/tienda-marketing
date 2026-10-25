/**
 * Agregados para el paso 2 ("cómo nos fue"). Los suma Postgres (resumen_promocion,
 * migración 20261029120000): al modelo de lenguaje nunca llegan filas (regla #2)
 * y esta capa nunca sale a Meta (regla #1).
 *
 * Solo servidor: usa la clave secreta.
 */

import { rpc, type Supabase } from '../supabase/rest.ts'
import { cuentasDeMarca, marcaPorId, ordenarMarcas, tokenDeMarca } from './marcas.ts'

type Fetch = typeof fetch

export type ResumenPromocion = {
  /** false = el modelo tiene menos de 3 caracteres útiles y no se filtró por él. */
  modeloFiltrable: boolean
  publicaciones: number
  organico: {
    mencionaModelo: boolean
    plataforma: string
    tipo: string
    publicaciones: number
    vistas: number
    interaccionesPromedio: number
    comentariosPromedio: number
    tasaInteraccion: number | null
  }[]
  porPromo: {
    promo: string
    publicaciones: number
    vistas: number
    interaccionesPromedio: number
    tasaInteraccion: number | null
  }[]
  mejores: {
    fecha: string
    plataforma: string
    tipo: string
    mencionaModelo: boolean
    texto: string
    vistas: number
    interacciones: number
  }[]
  campanias: {
    totales: { campanias: number; gasto: number; impresiones: number; clics: number; resultados: number }
    top: {
      nombre: string
      mencionaModelo: boolean
      gasto: number
      impresiones: number
      clics: number
      resultados: number
    }[]
  }
}

export type ParametrosResumenPromocion = {
  /** Ids de Meta de las cuentas de ESA marca (página de Facebook e Instagram). */
  cuentas: readonly string[]
  /** Token de la marca para atribuir campañas por nombre (ej. "benelli"). */
  marca: string
  modelo: string
  desde: string
  hasta: string
}

const VACIO: ResumenPromocion = {
  modeloFiltrable: false,
  publicaciones: 0,
  organico: [],
  porPromo: [],
  mejores: [],
  campanias: { totales: { campanias: 0, gasto: 0, impresiones: 0, clics: 0, resultados: 0 }, top: [] },
}

export async function leerResumenPromocion(
  s: Supabase,
  organizacionId: string,
  p: ParametrosResumenPromocion,
  f: Fetch,
): Promise<ResumenPromocion> {
  const r = await rpc<Partial<ResumenPromocion> | null>(
    s,
    'resumen_promocion',
    { p_org: organizacionId, p_cuentas: p.cuentas, p_marca: p.marca, p_modelo: p.modelo, p_desde: p.desde, p_hasta: p.hasta },
    f,
  )
  return {
    ...VACIO,
    ...(r ?? {}),
    campanias: { ...VACIO.campanias, ...(r?.campanias ?? {}) },
  }
}

export const MAX_MARCAS_COMPARACION = 7
export const MAX_MODELOS_COMPARACION = 3

export type ParametrosComparacion = {
  /** Ids de marca (se ordenan según MARCAS). */
  marcaIds: readonly string[]
  /** 1 a 3 modelos. */
  modelos: readonly string[]
  desde: string
  hasta: string
}

export type ResumenComparado = { marcaId: string; modelo: string; resumen: ResumenPromocion }

/**
 * "Cómo le fue a cada marca" en UNA ida y vuelta: resumen_promocion_comparado
 * (migración 20261030120000) llama a resumen_promocion por marca × modelo, sin
 * tocarla. Sigue sumando Postgres (regla #2) y nunca sale a Meta (regla #1).
 */
export async function leerComparacionPromocion(
  s: Supabase,
  organizacionId: string,
  p: ParametrosComparacion,
  f: Fetch,
): Promise<ResumenComparado[]> {
  const marcas = ordenarMarcas(p.marcaIds).slice(0, MAX_MARCAS_COMPARACION)
  const modelos = p.modelos.slice(0, MAX_MODELOS_COMPARACION)
  if (marcas.length === 0 || modelos.length === 0) return []

  const grupos = marcas.map((id) => {
    const m = marcaPorId(id)!
    return { clave: id, cuentas: cuentasDeMarca(m), token: tokenDeMarca(m) }
  })
  const filas = await rpc<{ clave: string; modelo: string; resumen: Partial<ResumenPromocion> | null }[] | null>(
    s,
    'resumen_promocion_comparado',
    { p_org: organizacionId, p_grupos: grupos, p_modelos: modelos, p_desde: p.desde, p_hasta: p.hasta },
    f,
  )
  return (filas ?? []).flatMap((x) =>
    marcaPorId(x.clave)
      ? [{ marcaId: x.clave, modelo: x.modelo, resumen: { ...VACIO, ...(x.resumen ?? {}), campanias: { ...VACIO.campanias, ...(x.resumen?.campanias ?? {}) } } }]
      : [],
  )
}

export type FilaComparacion = {
  marca: string
  modelo: string
  publicaciones: number
  vistasPromedio: number
  tasaInteraccionPct: number | null
  /** Publicaciones que nombran el modelo. */
  mencionanModelo: number
  /** Gasto de las campañas cuyo NOMBRE menciona la marca o el modelo (aproximado). */
  gastoAtribuido: number
}

const redondear = (n: number): number => Math.round(n * 100) / 100

/** De los resúmenes a una fila por marca × modelo: lo que muestra la tabla y lo único que ve el modelo. */
export function filasDeComparacion(rs: readonly ResumenComparado[]): FilaComparacion[] {
  return rs.map(({ marcaId, modelo, resumen }) => {
    const posts = resumen.organico.reduce((t, x) => t + x.publicaciones, 0)
    const vistas = resumen.organico.reduce((t, x) => t + x.vistas, 0)
    const interacciones = resumen.organico.reduce((t, x) => t + x.interaccionesPromedio * x.publicaciones, 0)
    return {
      marca: marcaPorId(marcaId)?.nombre ?? marcaId,
      modelo,
      publicaciones: resumen.publicaciones,
      vistasPromedio: posts === 0 ? 0 : redondear(vistas / posts),
      tasaInteraccionPct: vistas === 0 ? null : redondear((interacciones / vistas) * 100),
      mencionanModelo: resumen.organico.filter((x) => x.mencionaModelo).reduce((t, x) => t + x.publicaciones, 0),
      gastoAtribuido: redondear(resumen.campanias.totales.gasto),
    }
  })
}
