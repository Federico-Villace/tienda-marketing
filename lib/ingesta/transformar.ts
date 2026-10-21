/**
 * De la forma de Meta a las filas de la base. Funciones puras.
 *
 * Meta manda los números como strings. Acá se convierten una sola vez, y el
 * JSON original queda en `crudo` por si mañana hace falta otro dato (ADR-004).
 */

import type { Accion, CampaniaMeta, InsightDiario } from './meta-ads.ts'

/**
 * Qué cuenta como "resultado" para una concesionaria (ADR-014): conversaciones
 * de mensajes iniciadas y leads. `lead` ya es el total de sus subtipos
 * (lead_grouped, onsite_web_lead…), por eso no se suman esos.
 */
export const ACCIONES_RESULTADO = [
  'onsite_conversion.messaging_conversation_started_7d',
  'lead',
] as const

export function contarResultados(acciones: readonly Accion[] | undefined): number {
  return (acciones ?? [])
    .filter((a) => (ACCIONES_RESULTADO as readonly string[]).includes(a.action_type))
    .reduce((total, a) => total + (Number(a.value) || 0), 0)
}

type Contexto = { readonly organizacionId: string; readonly cuentaId: string }

export const filaCampania = (c: CampaniaMeta, ctx: Contexto) => ({
  organizacion_id: ctx.organizacionId,
  cuenta_id: ctx.cuentaId,
  meta_campaign_id: c.id,
  nombre: c.name,
  objetivo: c.objective ?? null,
  estado: c.effective_status ?? null,
  inicio: c.start_time ?? null,
  fin: c.stop_time ?? null,
  crudo: c,
})

const entero = (v?: string) => (v === undefined ? 0 : Math.round(Number(v)) || 0)
const decimal = (v?: string) => (v === undefined || v === '' ? null : Number(v))

export const filaMetrica = (i: InsightDiario, campaniaId: string) => ({
  campania_id: campaniaId,
  fecha: i.date_start,
  gasto: Number(i.spend ?? 0) || 0,
  impresiones: entero(i.impressions),
  clics: entero(i.clicks),
  ctr: decimal(i.ctr),
  cpc: decimal(i.cpc),
  conversiones: contarResultados(i.actions),
  crudo: i,
})

/** Argentina no tiene horario de verano: UTC-3 todo el año. */
const OFFSET_BUENOS_AIRES_MS = -3 * 3_600_000
const DIA_MS = 86_400_000

const isoLocal = (ms: number) => new Date(ms + OFFSET_BUENOS_AIRES_MS).toISOString().slice(0, 10)

/** Los últimos `dias` días, hoy incluido, en la zona horaria de las cuentas. */
export const rangoDias = (hoy: Date, dias: number) => ({
  desde: isoLocal(hoy.getTime() - (dias - 1) * DIA_MS),
  hasta: isoLocal(hoy.getTime()),
})

/** Instante (ms) en que arranca `fecha` (YYYY-MM-DD) en hora de Argentina. */
export const inicioDiaAR = (fecha: string): number => Date.parse(`${fecha}T00:00:00Z`) - OFFSET_BUENOS_AIRES_MS

/** Fecha argentina (YYYY-MM-DD) de un instante; null si no es una fecha válida. */
export const fechaAR = (instante: string): string | null => {
  const ms = Date.parse(instante)
  return Number.isNaN(ms) ? null : isoLocal(ms)
}

/** Todas las fechas de `desde` a `hasta`, ambas inclusive. */
export function fechasEntre(desde: string, hasta: string): string[] {
  const fechas: string[] = []
  for (let ms = Date.parse(`${desde}T00:00:00Z`); ms <= Date.parse(`${hasta}T00:00:00Z`); ms += DIA_MS) {
    fechas.push(new Date(ms).toISOString().slice(0, 10))
  }
  return fechas
}
