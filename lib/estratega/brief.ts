/** Validación del brief que manda la persona. Mensajes en español: van a la UI. */

import { MARCAS } from '../datos/marcas.ts'
import type { Brief, Validacion } from './tipos.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const MAX_NOTAS = 1000
const MAX_VENTANA_DIAS = 90
const DIA_MS = 24 * 60 * 60 * 1000

/** Fecha ISO real (rechaza 2026-13-45 y 2026-02-30). */
export function fechaIso(x: unknown): number | null {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return null
  const t = Date.parse(`${x}T00:00:00Z`)
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== x ? null : t
}

const textoOpcional = (x: unknown, max: number): string | null | undefined => {
  if (x === undefined || x === null) return null
  if (typeof x !== 'string') return undefined
  const t = x.trim()
  return t.length > max ? undefined : t === '' ? null : t
}

export function validarBrief(x: unknown): Validacion<Brief, 'brief'> {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) return { ok: false, errores: ['El brief es inválido.'] }
  const b = x as Record<string, unknown>
  const errores: string[] = []

  const analisisId = typeof b.analisisId === 'string' && UUID.test(b.analisisId) ? b.analisisId : null
  if (!analisisId) errores.push('Elegí un análisis.')

  const objetivo = typeof b.objetivo === 'string' ? b.objetivo.trim() : ''
  if (objetivo.length < 3 || objetivo.length > 300) errores.push('El objetivo es obligatorio (3 a 300 caracteres).')

  const nombres = MARCAS.map((m) => m.nombre)
  const marcas = Array.isArray(b.marcas) ? b.marcas : []
  if (marcas.length === 0 || !marcas.every((m) => typeof m === 'string' && nombres.includes(m))) {
    errores.push('Elegí al menos una marca válida.')
  }

  const producto = textoOpcional(b.producto, 100)
  if (producto === undefined) errores.push('El producto es demasiado largo (máximo 100 caracteres).')

  const p = b.presupuestoTopeArs
  let presupuestoTopeArs: number | null = null
  if (p !== undefined && p !== null) {
    if (typeof p !== 'number' || !Number.isFinite(p) || p <= 0) errores.push('El presupuesto tope debe ser un número mayor a 0 (ARS).')
    else presupuestoTopeArs = p
  }

  const d = fechaIso(b.desde)
  const h = fechaIso(b.hasta)
  if (d === null || h === null) errores.push('Las fechas deben ser válidas (AAAA-MM-DD).')
  else if (d > h) errores.push('La fecha desde no puede ser posterior a hasta.')
  else if ((h - d) / DIA_MS + 1 > MAX_VENTANA_DIAS) errores.push(`La ventana no puede pasar de ${MAX_VENTANA_DIAS} días.`)

  const notas = textoOpcional(b.notas, MAX_NOTAS)
  if (notas === undefined) errores.push(`Las notas no pueden pasar de ${MAX_NOTAS} caracteres.`)

  if (errores.length > 0) return { ok: false, errores }
  return {
    ok: true,
    brief: {
      analisisId: analisisId!,
      objetivo,
      marcas: marcas as string[],
      producto: producto ?? null,
      presupuestoTopeArs,
      desde: b.desde as string,
      hasta: b.hasta as string,
      notas: notas ?? null,
    },
  }
}
