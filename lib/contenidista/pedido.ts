/**
 * Lo único que acepta POST /api/contenido: { plan_id, semana, notas? } (R2.1).
 * Nada de filas, agregados, análisis ni claves: si viene otra clave, 400.
 */

import { UUID } from '../agentes/http.ts'
import { LIMITES } from './limites.ts'
import type { PedidoTanda } from './tipos.ts'

export type ResultadoPedido =
  | { ok: true; pedido: PedidoTanda }
  | { ok: false; status: 400 | 422; errores: string[] }

const CLAVES = ['plan_id', 'semana', 'notas']

export function validarPedido(x: unknown): ResultadoPedido {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) {
    return { ok: false, status: 400, errores: ['El pedido debe ser un objeto con plan_id y semana.'] }
  }
  const r = x as Record<string, unknown>
  const errores: string[] = []
  for (const k of Object.keys(r)) if (!CLAVES.includes(k)) errores.push(`El campo "${k}" no está permitido.`)
  if (typeof r.plan_id !== 'string' || !UUID.test(r.plan_id)) errores.push('"plan_id" debe ser un id de plan válido.')
  if (typeof r.semana !== 'number' || !Number.isInteger(r.semana) || r.semana < 1) errores.push('"semana" debe ser un entero desde 1.')
  if (r.notas !== undefined && r.notas !== null && typeof r.notas !== 'string') errores.push('"notas" debe ser un texto.')
  if (errores.length > 0) return { ok: false, status: 400, errores }

  const notas = typeof r.notas === 'string' && r.notas.trim() !== '' ? r.notas.trim() : null
  if (notas !== null && notas.length > LIMITES.NOTAS) {
    return { ok: false, status: 422, errores: [`Las notas no pueden pasar de ${LIMITES.NOTAS} caracteres.`] }
  }
  return { ok: true, pedido: { planId: r.plan_id as string, semana: r.semana as number, notas } }
}
