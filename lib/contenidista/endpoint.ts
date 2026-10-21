/**
 * POST /api/contenido: lo dispara una persona desde /contenido (no es un cron).
 *
 * Request → Response con fetch inyectado, como lib/estratega/endpoint.ts; el
 * route.ts es una capa fina que delega acá.
 *
 * Reglas duras que se cumplen en este archivo:
 * - Capa 2: lee de Postgres, nunca sale a Meta.
 * - Regla #2: al modelo solo le llega el TEXTO de un plan aprobado (sin
 *   presupuesto), UNA semana y las notas: nunca filas, agregados ni ids.
 * - Regla #3: el único gasto (la llamada a OpenAI) pasa por un click humano de
 *   un director u operador, y se registra con su costo real.
 * - Ninguna respuesta ni log lleva OPENAI_API_KEY.
 */

import { autorizarAgente } from '../agentes/autorizar.ts'
import { pedirJson } from '../agentes/estructurado.ts'
import { hashJson } from '../agentes/hash.ts'
import { error, responder } from '../agentes/http.ts'
import { ErrorOpenAI } from '../agentes/openai.ts'
import { costoUsd } from '../agentes/precios.ts'
import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { ErrorSupabase, rpc, seleccionar, type Supabase } from '../supabase/rest.ts'
import type { Plan } from '../estratega/tipos.ts'
import { FORMATO_CONTENIDISTA } from './esquema.ts'
import { COLUMNAS_PIEZA, COLUMNAS_TANDA, vistaDePieza, vistaDeTanda, type FilaPieza, type FilaTanda } from './historial.ts'
import { LIMITES } from './limites.ts'
import { reemplazarMontos } from './montos.ts'
import { validarPedido } from './pedido.ts'
import { validarPiezas } from './piezas.ts'
import { INSTRUCCIONES, instruccionesRespaldo, mensajeUsuario, textoFuente, VERSION_PROMPT } from './prompt.ts'
import { excedeTope, piezasPedidas, rangoSemana } from './semana.ts'
import type { Pieza } from './tipos.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

/** Tokens de salida: 12 piezas con guion no entran en los 6000 por defecto. */
const MAX_TOKENS_SALIDA = 8000

async function buscarPorHash(s: Supabase, hash: string, f: Fetch): Promise<FilaTanda | undefined> {
  const [fila] = await seleccionar<FilaTanda>(
    s,
    'tandas_contenido',
    { select: COLUMNAS_TANDA, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, hash_entrada: `eq.${hash}`, limit: '1' },
    f,
  )
  return fila
}

/** Las piezas ORIGINALES (versión 1) de una tanda, en el orden en que se escribieron. */
async function piezasDe(s: Supabase, tandaId: string, f: Fetch) {
  const filas = await seleccionar<FilaPieza>(
    s,
    'piezas',
    { select: COLUMNAS_PIEZA, tanda_id: `eq.${tandaId}`, version: 'eq.1', order: 'orden.asc' },
    f,
  )
  return filas.map(vistaDePieza)
}

async function respuestaDeCache(s: Supabase, fila: FilaTanda, f: Fetch): Promise<Response> {
  return responder({ tanda: vistaDeTanda(fila, true), piezas: await piezasDe(s, fila.id, f), desdeCache: true }, 200)
}

/**
 * Un monto que el modelo inventó no tira la llamada (ya se pagó): se cambia por
 * [precio] y la persona lo completa. Lo que no tenga forma de pieza se deja tal
 * cual: validarPiezas lo va a rechazar.
 */
function limpiarMontos(crudo: unknown, fuente: string): unknown {
  const piezas = (crudo as { piezas?: unknown } | null)?.piezas
  if (!Array.isArray(piezas)) return crudo
  const limpias = piezas.map((p) => {
    const o = p as Partial<Pieza> | null
    const forma = o !== null && typeof o === 'object' && Array.isArray(o.hashtags) && o.hashtags.every((h) => typeof h === 'string')
    return forma ? reemplazarMontos(p as Pieza, fuente) : p
  })
  return { ...(crudo as object), piezas: limpias }
}

export async function manejarTanda(request: Request, entorno: Entorno, f: Fetch): Promise<Response> {
  const ctx = await autorizarAgente(request, entorno, 'MODELO_CONTENIDISTA', 'generar contenido', f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase, apiKey, modelo } = ctx

  try {
    const validado = validarPedido(await request.json().catch(() => null))
    if (!validado.ok) return responder({ error: 'El pedido no es válido.', errores: validado.errores }, validado.status)
    const { planId, semana, notas } = validado.pedido

    const [fila] = await seleccionar<{ id: string; estado: string; plan: Plan }>(
      supabase,
      'planes',
      { select: 'id,estado,plan', id: `eq.${planId}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
      f,
    )
    if (!fila) return error('No se encontró el plan elegido.', 404)
    // Solo se escribe sobre lo que el director aprobó, y sobre lo vigente.
    if (fila.estado !== 'aprobado') return error('Ese plan ya no es el aprobado: elegí el vigente.', 409)

    const plan = fila.plan
    const rango = rangoSemana(plan, semana)
    if (!rango) return error(`La semana ${semana} no está en el plan o queda fuera de su ventana.`, 422)
    if (excedeTope(plan, semana)) {
      return error(`La semana ${semana} pide ${piezasPedidas(plan, semana)} piezas; el tope es ${LIMITES.PIEZAS_POR_SEMANA}. Editá el plan.`, 422)
    }

    // Caché: mismo plan (versión exacta) + semana + notas + prompt + modelo = misma tanda, sin cobrar de nuevo.
    const hash = hashJson({ org: ORGANIZACION_PILOTO_ID, tipo: 'contenido', planId, plan, semana, notas, version: VERSION_PROMPT, modelo })
    const previo = await buscarPorHash(supabase, hash, f)
    if (previo) return await respuestaDeCache(supabase, previo, f)

    const { texto, uso } = await pedirJson(
      {
        apiKey,
        modelo,
        entrada: mensajeUsuario(plan, semana, rango.desde, rango.hasta, notas),
        instrucciones: INSTRUCCIONES,
        respaldo: instruccionesRespaldo(),
        formato: FORMATO_CONTENIDISTA,
        maxTokensSalida: MAX_TOKENS_SALIDA,
        etiqueta: 'contenido',
      },
      f,
    )
    const costo = costoUsd(modelo, uso)

    let crudo: unknown
    try {
      crudo = JSON.parse(texto)
    } catch {
      crudo = null
    }
    const contexto = { plan, semana, desde: rango.desde, hasta: rango.hasta, fuente: textoFuente(plan, semana, notas) }
    const piezas = validarPiezas(limpiarMontos(crudo, contexto.fuente), contexto, { origen: 'agente' })
    if (!piezas.ok) {
      // El costo se pierde: se loguea solo eso (nunca el texto del modelo ni claves).
      console.error('contenido: piezas inválidas', { costoUsd: costo })
      return error('El Contenidista devolvió piezas inválidas. Probá de nuevo.', 502)
    }

    const tanda = {
      organizacion_id: ORGANIZACION_PILOTO_ID,
      plan_id: planId,
      semana,
      notas,
      hash_entrada: hash,
      version_prompt: VERSION_PROMPT,
      modelo,
      tokens_entrada: uso.entrada,
      tokens_salida: uso.salida,
      tokens_cacheados: uso.cacheadas,
      tokens_razonamiento: uso.razonamiento,
      costo_usd: costo,
      creado_por: usuarioId,
    }

    try {
      const creada = await rpc<FilaTanda>(supabase, 'guardar_tanda', { p_tanda: tanda, p_piezas: piezas.piezas }, f)
      return responder({ tanda: vistaDeTanda(creada, false), piezas: await piezasDe(supabase, creada.id, f), desdeCache: false }, 200)
    } catch (e) {
      // Doble click: otro pedido igual ganó la carrera (unique organizacion+hash). Se devuelve esa tanda.
      if (e instanceof ErrorSupabase && e.status === 409) {
        const ganadora = await buscarPorHash(supabase, hash, f)
        if (ganadora) return await respuestaDeCache(supabase, ganadora, f)
      }
      throw e
    }
  } catch (e) {
    if (e instanceof ErrorOpenAI) {
      console.error('contenido: falló OpenAI', e.tipo, e.status ?? '')
      return error(e.message, e.tipo === 'timeout' ? 504 : 502)
    }
    // Solo el mensaje de errores propios (ErrorSupabase no lleva claves); nunca el objeto entero.
    console.error('contenido: falló', e instanceof ErrorSupabase ? e.message : 'error interno')
    return error('No se pudo generar el contenido. Probá de nuevo en un momento.', 500)
  }
}
