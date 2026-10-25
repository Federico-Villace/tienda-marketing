/**
 * La marca de una promoción. Hay UNA sola cuenta publicitaria para las 7 marcas,
 * así que las campañas no tienen marca: solo se pueden atribuir por el texto de
 * su NOMBRE. Este token es lo que se busca ahí (ADR-027, riesgo R14).
 */

import { MARCAS } from '../datos/marcas.ts'
import type { Marca } from '../datos/tipos.ts'

const PALABRAS_QUE_NO_IDENTIFICAN = /\b(quilmes|store)\b/gi

/** "Benelli Store Quilmes" → "benelli"; "QJ Motor Quilmes" → "qjmotor". */
export const tokenDeMarca = (m: Marca): string =>
  m.nombre.replace(PALABRAS_QUE_NO_IDENTIFICAN, '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** Ids de Meta de las cuentas orgánicas de la marca. */
export const cuentasDeMarca = (m: Marca): string[] => [m.id, m.igId]

export const marcaPorId = (id: string): Marca | undefined => MARCAS.find((m) => m.id === id)
