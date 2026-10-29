/**
 * Un turno de conversación con la IA (cambio de texto): abrir → llamar → validar → aplicar → cerrar.
 *
 * - El tope se chequea en Postgres ANTES de llamar a OpenAI (abrir_turno): un 409/429 no gasta nada.
 * - Cuesta lo que cuesta la llamada, la valide o no: un texto inválido se cobra y no se aplica.
 * - Un turno nunca queda pendiente salvo que el proceso se caiga (vence a los 120 s).
 */

import { ErrorOpenAI } from '../openai.ts'
import { costoUsd, type Uso } from '../precios.ts'
import { ErrorSupabase, type Supabase } from '../../supabase/rest.ts'
import { pedidosAnteriores } from './historial.ts'
import { abrirTurno, cerrarTurno, ErrorTurno, fallarTurno, leerTurnos } from './repositorio.ts'
import type { ArgsAbrir, TokensTurno } from './tipos.ts'

type Fetch = typeof fetch

export type ParamsTurno<T, R> = ArgsAbrir & {
  s: Supabase
  modelo: string
  version: string
  /** Llama al modelo con los pedidos anteriores (solo los que salieron bien). */
  llamar: (anteriores: string[]) => Promise<{ texto: string; uso: Uso }>
  validar: (texto: string) => { ok: true; valor: T } | { ok: false; errores: string[] }
  aplicar: (valor: T) => Promise<R>
  /** Lo que queda guardado en el turno. */
  respuesta: (valor: T, aplicado: R) => Record<string, unknown>
}

export type ResultadoTurno<R> =
  | { ok: true; valor: R; turno: number; costoUsd: number }
  | { ok: false; status: number; error: string }

const tokensDe = (u: Uso): TokensTurno => ({ entrada: u.entrada, salida: u.salida, cacheados: u.cacheadas, razonamiento: u.razonamiento })

export async function ejecutarTurno<T, R>(p: ParamsTurno<T, R>, f: Fetch): Promise<ResultadoTurno<R>> {
  let turno: { conversacionId: string; turnoId: string; turno: number }
  try {
    turno = await abrirTurno(p.s, p, f)
  } catch (e) {
    if (e instanceof ErrorTurno) return { ok: false, status: e.status, error: e.mensaje }
    throw e
  }

  /** Cierra el turno como error; si ni eso se puede, no tapa el error de fondo. */
  const fallar = async (error: string, costo: number, tokens?: TokensTurno) => {
    try {
      await fallarTurno(p.s, { turnoId: turno.turnoId, error, costoUsd: costo, tokens }, f)
    } catch {
      console.error('conversacion: no se pudo cerrar el turno como error')
    }
  }

  let respuestaIA: { texto: string; uso: Uso }
  try {
    const previos = await leerTurnos(p.s, turno.conversacionId, f)
    respuestaIA = await p.llamar(pedidosAnteriores(previos))
  } catch (e) {
    if (e instanceof ErrorOpenAI) {
      // Un timeout puede haber gastado igual: se cuenta el estimado. Lo demás no llegó a cobrarse.
      await fallar(e.message, e.tipo === 'timeout' ? p.estimadoUsd : 0)
      return { ok: false, status: e.tipo === 'timeout' ? 504 : 502, error: e.message }
    }
    await fallar('error interno', 0)
    throw e
  }

  const costo = costoUsd(p.modelo, respuestaIA.uso)
  const tokens = tokensDe(respuestaIA.uso)

  const valido = p.validar(respuestaIA.texto)
  if (!valido.ok) {
    await fallar('La IA devolvió un texto que no cumple las reglas', costo, tokens)
    return { ok: false, status: 502, error: 'La IA devolvió un texto que no cumple las reglas: probá con otro pedido.' }
  }

  let aplicado: R
  try {
    aplicado = await p.aplicar(valido.valor)
  } catch (e) {
    if (e instanceof ErrorSupabase && e.status === 409) {
      await fallar('Cambió mientras se pedía', costo, tokens)
      return { ok: false, status: 409, error: 'Cambió mientras se pedía: recargá la pantalla.' }
    }
    await fallar('error interno al aplicar', costo, tokens)
    throw e
  }

  await cerrarTurno(
    p.s,
    { turnoId: turno.turnoId, respuesta: p.respuesta(valido.valor, aplicado), modelo: p.modelo, version: p.version, tokens, costoUsd: costo },
    f,
  )
  return { ok: true, valor: aplicado, turno: turno.turno, costoUsd: costo }
}
