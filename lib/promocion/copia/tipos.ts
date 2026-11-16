/**
 * Copia fiel de la referencia (ADR-040): la IA de imagen copia el diseño de una placa de referencia con la moto y los datos de la
 * persona, ESCRIBE los textos, y un verificador los lee de vuelta. Estos son los tipos compartidos de ese camino.
 */

import type { Cta, Ocultable } from '../diseno/tipos.ts'

export const PLANTILLA_COPIA = 'copia_fiel' as const
export const esCopiaFiel = (x: unknown): x is typeof PLANTILLA_COPIA => x === PLANTILLA_COPIA

/** Cómo se resuelve el logo del negocio: el real (lo pega nuestro renderer), su nombre en letras (la IA lo escribe) o ninguno. */
export type ModoLogo = 'real' | 'nombre' | 'ninguno'

/**
 * Los textos que se le piden a la IA, tal como van a quedar escritos. Un `null` es "no va": o no hay dato (frase vacía, sin
 * condición, sin precio por mostrarPrecio=false) o la persona lo SACÓ (entonces también figura en `ocultos`, y la IA recibe la
 * orden de omitir ese elemento de la referencia y rellenar su lugar).
 */
export type TextosCopia = {
  modelo: string | null
  precio: string | null
  condicion: { texto: string; destacado: string } | null
  frase: string | null
  cta: Cta | null
  lugar: string | null
  /** El nombre de la concesionaria, SOLO si no hay logo dibujable y la persona no sacó los logos. */
  negocio: string | null
  logo: ModoLogo
  /** Lo que la persona sacó, en orden canónico. */
  ocultos: Ocultable[]
}

export const ROLES_LEIDOS = ['modelo', 'precio', 'condicion', 'frase', 'cta', 'lugar', 'marca', 'otro'] as const
export type RolLeido = (typeof ROLES_LEIDOS)[number]
export type TextoLeido = { texto: string; rol: RolLeido; dudoso: boolean }
/** Una caja relativa a la imagen: x, y (esquina superior izquierda), w, h, de 0 a 1. */
export type Caja01 = { x: number; y: number; w: number; h: number }
export type Lectura = { textos: TextoLeido[]; logo: Caja01 | null; fondoLogo: 'claro' | 'oscuro' | null }

export type CampoTexto = 'modelo' | 'precio' | 'condicion' | 'frase' | 'cta' | 'lugar' | 'negocio' | 'otro'
export type MotivoDiferencia = 'distinto' | 'falta' | 'sobra' | 'ilegible'
export type Diferencia = { campo: CampoTexto; motivo: MotivoDiferencia; esperado: string | null; leido: string | null }
export type Comparacion = { ok: true; avisos: Diferencia[] } | { ok: false; diferencias: Diferencia[]; avisos: Diferencia[] }

export type EstadoVerificacion = 'pendiente' | 'ok' | 'difiere' | 'error'
export type VerificacionVista = {
  /** null si ni siquiera se pudo abrir la fila de la verificación. */
  id: string | null
  estado: EstadoVerificacion
  diferencias: Diferencia[]
  avisos: Diferencia[]
  puedeReverificar: boolean
  costoReverificarUsd: number | null
}
