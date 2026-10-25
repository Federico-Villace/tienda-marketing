/**
 * Agregados para el paso 2 ("cómo nos fue"). Los suma Postgres (resumen_promocion,
 * migración 20261029120000): al modelo de lenguaje nunca llegan filas (regla #2)
 * y esta capa nunca sale a Meta (regla #1).
 *
 * Solo servidor: usa la clave secreta.
 */

import { rpc, type Supabase } from '../supabase/rest.ts'

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
