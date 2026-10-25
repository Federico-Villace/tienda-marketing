/** Lo que necesitan las pantallas de /promocionar del entorno y de la sesión (solo servidor). */

import { MODELO_POR_DEFECTO } from '../agentes/autorizar.ts'
import { leerRol, puedeEditar } from '../agentes/pantalla.ts'
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
    }
  | { tipo: 'error'; mensaje: string }

export async function leerContextoPagina(entorno: Entorno, usuarioId: string | null, f: typeof fetch): Promise<ContextoPagina> {
  const url = entorno.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const secretKey = entorno.SUPABASE_SECRET_KEY?.trim()
  if (!url || !secretKey) return { tipo: 'error', mensaje: 'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY.' }
  const supabase = { url, secretKey }
  try {
    const rol = await leerRol(supabase, usuarioId, f)
    return {
      tipo: 'ok',
      supabase,
      rol,
      puedeEditar: puedeEditar(rol),
      openai: Boolean(entorno.OPENAI_API_KEY?.trim()),
      costoAntecedentes: formatearCostoAproximado(costoAproximadoAntecedentes(entorno.MODELO_ANALISTA?.trim() || MODELO_POR_DEFECTO)),
      costoTextos: formatearCostoAproximado(costoAproximadoTextos(entorno.MODELO_CONTENIDISTA?.trim() || MODELO_POR_DEFECTO)),
    }
  } catch (e) {
    return { tipo: 'error', mensaje: e instanceof Error ? e.message : String(e) }
  }
}
