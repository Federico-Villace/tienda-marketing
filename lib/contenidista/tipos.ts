/**
 * Tipos del Contenidista. Una pieza es TEXTO propuesto (hook, copy, guion,
 * brief visual): nada se publica ni se genera como imagen o video todavía.
 */

import type { Formato, Plan, Plataforma } from '../estratega/tipos.ts'

export { FORMATOS, PLATAFORMAS } from '../estratega/tipos.ts'
export type { Formato, Plataforma }

export type Pieza = {
  /** Nombre de una de las MARCAS (y del plan). */
  marca: string
  plataforma: Plataforma
  formato: Formato
  /** AAAA-MM-DD, dentro de la semana. */
  fecha: string
  hook: string
  copy: string
  /** Cada uno con '#'. */
  hashtags: string[]
  cta: string
  /** Solo reel y video. */
  guion: string | null
  briefVisual: string
  /** Solo imagen y carrusel. */
  altText: string | null
  /** La idea del plan de la que sale (textual). */
  ideaOrigen: string
}

/** Salida del LLM: raíz objeto (strict no admite arrays en la raíz). */
export type Tanda = { piezas: Pieza[] }

export type PedidoTanda = { planId: string; semana: number; notas: string | null }

export type EstadoPieza = 'borrador' | 'aprobada' | 'descartada' | 'reemplazada'
export type OrigenPieza = 'agente' | 'edicion'

export type PiezaVista = {
  id: string
  raizId: string
  padreId: string | null
  version: number
  origen: OrigenPieza
  estado: EstadoPieza
  tandaId: string
  planId: string
  semana: number
  orden: number
  pieza: Pieza
  creadoEn: string
  aprobadoEn: string | null
}

export type TandaVista = {
  id: string
  planId: string
  semana: number
  notas: string | null
  modelo: string
  costoUsd: number
  creadoEn: string
  /** true = se reutilizó una guardada: este pedido no costó nada. */
  desdeCache: boolean
}

/** Lo que el validador necesita saber de la semana que se está escribiendo. */
export type ContextoSemana = {
  plan: Plan
  semana: number
  /** Primer y último día de la semana, ya recortados a la ventana del plan. */
  desde: string
  hasta: string
  /** Texto contra el que se respaldan los montos: el mismo que ve el modelo. */
  fuente: string
}
