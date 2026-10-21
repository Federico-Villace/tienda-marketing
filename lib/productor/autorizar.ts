/**
 * Puerta del Productor: sesión, configuración, tope mensual y rol.
 *
 * Todo lo que puede gastar plata pasa por acá ANTES de tocar Gemini. Sin
 * GEMINI_API_KEY o sin PRESUPUESTO_MENSUAL_USD válido el Productor está apagado
 * (503). Ningún mensaje lleva la clave.
 */

import { HEADER_USUARIO } from '../auth/acceso.ts'
import { autorizarMiembro, type Miembro } from '../agentes/autorizar.ts'
import { error } from '../agentes/http.ts'
import { MOTOR_IMAGEN_POR_DEFECTO, tienePrecioImagen } from './precios.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

export type ContextoProductor = Miembro & {
  readonly apiKey: string
  readonly topeUsd: number
  readonly motorPorDefecto: string
}

/** El tope mensual en US$: null si falta o no es un número positivo (Productor apagado). */
export function leerTope(valor: string | undefined): number | null {
  const texto = valor?.trim()
  if (!texto || !/^\d+(\.\d+)?$/.test(texto)) return null
  const n = Number(texto)
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function autorizarProductor(
  request: Request,
  entorno: Entorno,
  accion: string,
  f: Fetch,
): Promise<ContextoProductor | Response> {
  if (!request.headers.get(HEADER_USUARIO)) return error('Iniciá sesión.', 401)

  if (!entorno.NEXT_PUBLIC_SUPABASE_URL?.trim() || !entorno.SUPABASE_SECRET_KEY?.trim()) {
    return error('Faltan las variables de Supabase.', 500)
  }
  const apiKey = entorno.GEMINI_API_KEY?.trim()
  if (!apiKey) return error('Falta GEMINI_API_KEY: el Productor está deshabilitado.', 503)
  const topeUsd = leerTope(entorno.PRESUPUESTO_MENSUAL_USD)
  if (topeUsd === null) return error('Sin PRESUPUESTO_MENSUAL_USD el Productor está apagado.', 503)

  // Un motor sin precio no se usa: no se gasta lo que no se puede calcular.
  const motorPorDefecto = entorno.MODELO_IMAGEN?.trim() || MOTOR_IMAGEN_POR_DEFECTO
  if (!tienePrecioImagen(motorPorDefecto)) {
    return error(`El motor "${motorPorDefecto}" no tiene precio cargado: no se puede calcular el costo.`, 500)
  }

  const miembro = await autorizarMiembro(request, entorno, accion, f)
  if (miembro instanceof Response) return miembro
  return { ...miembro, apiKey, topeUsd, motorPorDefecto }
}
