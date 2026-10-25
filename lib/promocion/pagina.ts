/** Lo que necesitan las pantallas de /promocionar del entorno y de la sesión (solo servidor). */

import { MODELO_POR_DEFECTO } from '../agentes/autorizar.ts'
import { leerRol, puedeEditar } from '../agentes/pantalla.ts'
import { leerTope } from '../productor/autorizar.ts'
import { MOTOR_IMAGEN_POR_DEFECTO, tienePrecioImagen } from '../productor/precios.ts'
import type { Supabase } from '../supabase/rest.ts'
import { costoAproximadoAntecedentes, costoAproximadoTextos, formatearCostoAproximado } from './costos.ts'

type Entorno = Record<string, string | undefined>

export type ContextoPagina =
  | {
      tipo: 'ok'
      supabase: Supabase
      rol: string | null
      puedeEditar: boolean
      /** Hay clave de OpenAI (el booleano, nunca el valor). */
      openai: boolean
      /** "~US$ 0,002", o '' si el modelo no tiene precio cargado. */
      costoAntecedentes: string
      costoTextos: string
      /** El unitario en dólares (null si el modelo no tiene precio): para el total de un lote. */
      costoAntecedentesUsd: number | null
      costoTextosUsd: number | null
      /** La imagen (Gemini) gasta dólares: sin clave o sin tope válido está apagada, con el motivo en castellano. */
      imagen: { apagado: string | null; topeUsd: number | null; motor: string }
    }
  | { tipo: 'error'; mensaje: string }

export async function leerContextoPagina(entorno: Entorno, usuarioId: string | null, f: typeof fetch): Promise<ContextoPagina> {
  const url = entorno.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const secretKey = entorno.SUPABASE_SECRET_KEY?.trim()
  if (!url || !secretKey) return { tipo: 'error', mensaje: 'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY.' }
  const supabase = { url, secretKey }
  try {
    const rol = await leerRol(supabase, usuarioId, f)
    const topeUsd = leerTope(entorno.PRESUPUESTO_MENSUAL_USD)
    const motorConfigurado = entorno.MODELO_IMAGEN?.trim()
    return {
      tipo: 'ok',
      supabase,
      rol,
      puedeEditar: puedeEditar(rol),
      openai: Boolean(entorno.OPENAI_API_KEY?.trim()),
      costoAntecedentes: formatearCostoAproximado(costoAproximadoAntecedentes(entorno.MODELO_ANALISTA?.trim() || MODELO_POR_DEFECTO)),
      costoTextos: formatearCostoAproximado(costoAproximadoTextos(entorno.MODELO_CONTENIDISTA?.trim() || MODELO_POR_DEFECTO)),
      costoAntecedentesUsd: costoAproximadoAntecedentes(entorno.MODELO_ANALISTA?.trim() || MODELO_POR_DEFECTO),
      costoTextosUsd: costoAproximadoTextos(entorno.MODELO_CONTENIDISTA?.trim() || MODELO_POR_DEFECTO),
      imagen: {
        apagado: !entorno.GEMINI_API_KEY?.trim()
          ? 'Generar imágenes está apagado: falta la clave de Gemini. Avisale a quien administra el sistema.'
          : topeUsd === null
            ? 'Generar imágenes está apagado: falta definir el tope de gasto mensual. Avisale a quien administra el sistema.'
            : null,
        topeUsd,
        motor: motorConfigurado && tienePrecioImagen(motorConfigurado) ? motorConfigurado : MOTOR_IMAGEN_POR_DEFECTO,
      },
    }
  } catch (e) {
    return { tipo: 'error', mensaje: e instanceof Error ? e.message : String(e) }
  }
}
