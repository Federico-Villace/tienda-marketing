/**
 * Structured outputs con respaldo: se pide con json_schema strict y, si OpenAI
 * rechaza el schema para el modelo (400), se reintenta con json_object y el
 * schema pegado en las instrucciones. Quien llama valida igual la salida.
 */

import { ErrorOpenAI, pedirRespuesta, type FormatoTexto } from './openai.ts'
import type { Uso } from './precios.ts'

export async function pedirJson(
  p: {
    apiKey: string
    modelo: string
    entrada: string
    instrucciones: string
    /** Instrucciones del plan B (con el schema pegado). */
    respaldo: string
    formato: FormatoTexto
    maxTokensSalida?: number
    /** Prefijo del log, p. ej. "planes". */
    etiqueta: string
  },
  f: typeof fetch,
): Promise<{ texto: string; uso: Uso }> {
  const { respaldo, etiqueta, ...comun } = p
  try {
    return await pedirRespuesta(comun, f)
  } catch (e) {
    if (!(e instanceof ErrorOpenAI) || e.tipo !== 'http' || e.status !== 400) throw e
    console.error(`${etiqueta}: OpenAI rechazó el json_schema, se reintenta con json_object`)
    return await pedirRespuesta({ ...comun, instrucciones: respaldo, formato: { type: 'json_object' } }, f)
  }
}
