/**
 * POST /api/planes: lo dispara una persona desde /campanas (no es un cron).
 *
 * Request → Response con fetch inyectado, como lib/analista/endpoint.ts; el
 * route.ts es una capa fina que delega acá.
 *
 * Reglas duras que se cumplen en este archivo:
 * - Capa 2: lee de Postgres, nunca sale a Meta.
 * - Regla #2: al modelo solo le llega el TEXTO de un análisis guardado y el
 *   brief: nunca filas, agregados ni ids.
 * - Regla #3: el único gasto (la llamada a OpenAI) pasa por un click humano de
 *   un director u operador, y se registra con su costo real.
 * - Ninguna respuesta ni log lleva OPENAI_API_KEY.
 */

import { autorizarAgente } from '../agentes/autorizar.ts'
import { hashJson } from '../agentes/hash.ts'
import { pedirJson } from '../agentes/estructurado.ts'
import { error, responder } from '../agentes/http.ts'
import { ErrorOpenAI } from '../agentes/openai.ts'
import { costoUsd } from '../agentes/precios.ts'
import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { ErrorSupabase, insertar, seleccionar, type Supabase } from '../supabase/rest.ts'
import { validarBrief } from './brief.ts'
import { FORMATO_ESTRATEGA } from './esquema.ts'
import { COLUMNAS_PLAN, vistaDeFila, type FilaPlan } from './historial.ts'
import { validarPlan } from './plan.ts'
import { INSTRUCCIONES, instruccionesRespaldo, mensajeUsuario, VERSION_PROMPT } from './prompt.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch


async function buscarPorHash(s: Supabase, hash: string, f: Fetch): Promise<FilaPlan | undefined> {
  const [fila] = await seleccionar<FilaPlan>(
    s,
    'planes',
    {
      select: COLUMNAS_PLAN,
      organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`,
      origen: 'eq.agente',
      hash_entrada: `eq.${hash}`,
      limit: '1',
    },
    f,
  )
  return fila
}

export async function manejarPlan(request: Request, entorno: Entorno, f: Fetch): Promise<Response> {
  const ctx = await autorizarAgente(request, entorno, 'MODELO_ESTRATEGA', 'pedir planes', f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase, apiKey, modelo } = ctx

  try {
    const validado = validarBrief(await request.json().catch(() => null))
    if (!validado.ok) return responder({ error: 'El brief no es válido.', errores: validado.errores }, 400)
    const brief = validado.brief

    // El análisis tiene que ser de esta organización: si no, ni se llama a OpenAI.
    const [analisis] = await seleccionar<{ id: string; contenido: string }>(
      supabase,
      'analisis',
      {
        select: 'id,contenido',
        id: `eq.${brief.analisisId}`,
        organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`,
        limit: '1',
      },
      f,
    )
    if (!analisis) return error('No se encontró el análisis elegido.', 404)

    // Caché: mismo análisis + mismo brief + mismo prompt + mismo modelo = mismo plan, sin cobrar de nuevo.
    const hash = hashJson({
      org: ORGANIZACION_PILOTO_ID,
      tipo: 'plan',
      analisisId: brief.analisisId,
      analisis: analisis.contenido,
      brief,
      version: VERSION_PROMPT,
      modelo,
    })
    const previo = await buscarPorHash(supabase, hash, f)
    if (previo) return responder({ plan: vistaDeFila(previo, true), desdeCache: true }, 200)

    const { texto, uso } = await pedirJson(
      {
        apiKey,
        modelo,
        entrada: mensajeUsuario(analisis.contenido, brief),
        instrucciones: INSTRUCCIONES,
        respaldo: instruccionesRespaldo(),
        formato: FORMATO_ESTRATEGA,
        etiqueta: 'planes',
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
    const plan = validarPlan(crudo, brief)
    if (!plan.ok) {
      // El costo se pierde: se loguea solo eso (nunca el texto del modelo ni claves).
      console.error('planes: plan inválido', { costoUsd: costo })
      return error('El Estratega devolvió un plan inválido. Probá de nuevo.', 502)
    }

    const fila = {
      organizacion_id: ORGANIZACION_PILOTO_ID,
      version: 1,
      origen: 'agente',
      estado: 'borrador',
      analisis_id: brief.analisisId,
      brief,
      plan: plan.plan,
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
      const creada = await insertar<FilaPlan>(supabase, 'planes', fila, f)
      return responder({ plan: vistaDeFila(creada, false), desdeCache: false }, 200)
    } catch (e) {
      // Doble click: otro pedido igual ganó la carrera (unique organizacion+hash). Se devuelve ese.
      if (e instanceof ErrorSupabase && e.status === 409) {
        const ganador = await buscarPorHash(supabase, hash, f)
        if (ganador) return responder({ plan: vistaDeFila(ganador, true), desdeCache: true }, 200)
      }
      throw e
    }
  } catch (e) {
    if (e instanceof ErrorOpenAI) {
      console.error('planes: falló OpenAI', e.tipo, e.status ?? '')
      return error(e.message, e.tipo === 'timeout' ? 504 : 502)
    }
    // Solo el mensaje de errores propios (ErrorSupabase no lleva claves); nunca el objeto entero.
    console.error('planes: falló', e instanceof ErrorSupabase ? e.message : 'error interno')
    return error('No se pudo generar el plan. Probá de nuevo en un momento.', 500)
  }
}
