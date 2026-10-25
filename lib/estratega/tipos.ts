/**
 * Tipos del Estratega. El plan es una PROPUESTA: nada de esto se ejecuta en
 * Meta (presupuesto en ARS, públicos en texto, ventana de fechas).
 */

import type { Plataforma, TipoPublicacion } from '../datos/tipos.ts'

export type { Plataforma }
export type Formato = TipoPublicacion

export const PLATAFORMAS: readonly Plataforma[] = ['instagram', 'facebook']
export const FORMATOS: readonly Formato[] = ['imagen', 'video', 'carrusel', 'reel', 'historia']
export const NIVELES_PRESUPUESTO = ['campania', 'conjunto', 'a_definir'] as const
export type NivelPresupuesto = (typeof NIVELES_PRESUPUESTO)[number]

export type Brief = {
  analisisId: string
  objetivo: string
  /** Nombres de MARCAS. */
  marcas: string[]
  producto: string | null
  presupuestoTopeArs: number | null
  desde: string
  hasta: string
  notas: string | null
}

export type Plan = {
  objetivo: string
  mensajeCentral: string
  publico: { descripcion: string; segmentos: { nombre: string; criterio: string; porque: string }[] }
  marcas: string[]
  presupuesto: { montoArs: number | null; nivel: NivelPresupuesto; nota: string | null }
  ventana: { desde: string; hasta: string }
  canales: { plataforma: Plataforma; formatos: Formato[]; porcentaje: number; porque: string }[]
  calendario: {
    semana: number
    eje: string
    piezas: {
      plataforma: Plataforma
      formato: Formato
      cantidad: number
      idea: string
      /** Nombre de una marca del brief; null = es para todas las del plan. */
      marca: string | null
    }[]
  }[]
  kpis: { metrica: string; meta: string }[]
  fundamentos: string[]
  supuestos: string[]
}

export type EstadoPlan = 'borrador' | 'aprobado' | 'descartado' | 'reemplazado'
export type OrigenPlan = 'agente' | 'edicion'

export type PlanVista = {
  id: string
  raizId: string
  padreId: string | null
  version: number
  origen: OrigenPlan
  estado: EstadoPlan
  brief: Brief
  plan: Plan
  analisisId: string
  modelo: string | null
  costoUsd: number
  creadoEn: string
  aprobadoEn: string | null
  /** true = se reutilizó uno guardado: este pedido no costó nada. */
  desdeCache: boolean
}

export type { Validacion } from '../agentes/validar.ts'
