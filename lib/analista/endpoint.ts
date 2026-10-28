/**
 * POST /api/analisis: lo dispara una persona desde /tablero (no es un cron).
 *
 * Request → Response con fetch inyectado, como lib/ingesta/endpoint.ts; el
 * route.ts es una capa fina que delega acá.
 *
 * Reglas duras que se cumplen en este archivo:
 * - Capa 2: lee de Postgres, nunca sale a Meta.
 * - Regla #2: al modelo solo le llega armarEntrada(), un agregado.
 * - Regla #3: el único gasto (la llamada a OpenAI) pasa por un click humano de
 *   un director u operador, y se registra con su costo real.
 * - Ninguna respuesta ni log lleva OPENAI_API_KEY.
 */

import { ErrorSupabase, insertar, seleccionar, type Supabase } from '../supabase/rest.ts'
import { autorizarAgente } from '../agentes/autorizar.ts'
import { filtrarPublicaciones, parsearFiltros } from '../datos/filtros.ts'
import { leerMensajes } from '../datos/mensajes.ts'
import { leerPublicaciones } from '../datos/publicaciones.ts'
import { leerPublicidad } from '../datos/publicidad.ts'
import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { armarEntrada, hashEntrada } from './entrada.ts'
import { COLUMNAS_ANALISIS, leerEdiciones, vistaDeFila, type FilaAnalisis } from './historial.ts'
import { ErrorOpenAI } from '../agentes/openai.ts'
import { pedirJson } from '../agentes/estructurado.ts'
import { costoUsd } from '../agentes/precios.ts'
import { FORMATO_ANALISTA } from './esquema.ts'
import { validarAnalisisV4 } from './estructurado.ts'
import { INSTRUCCIONES, INSTRUCCIONES_RESPALDO, mensajeUsuario, VERSION_PROMPT } from './prompt.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

/** El JSON estructurado + el razonamiento ocupan más que el texto plano de antes. */
const MAX_TOKENS_SALIDA = 8000

const responder = (cuerpo: unknown, status: number) => Response.json(cuerpo, { status })
const error = (mensaje: string, status: number) => responder({ error: mensaje }, status)

async function buscarPorHash(s: Supabase, hash: string, f: Fetch): Promise<FilaAnalisis | undefined> {
  const [fila] = await seleccionar<FilaAnalisis>(
    s,
    'analisis',
    {
      select: COLUMNAS_ANALISIS,
      organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`,
      hash_entrada: `eq.${hash}`,
      limit: '1',
    },
    f,
  )
  return fila
}

export async function manejarAnalisis(
  request: Request,
  entorno: Entorno,
  f: Fetch,
  ahora: Date,
): Promise<Response> {
  const ctx = await autorizarAgente(request, entorno, 'MODELO_ANALISTA', 'pedir análisis', f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase, apiKey, modelo } = ctx

  try {
    const cuerpo = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const texto = (k: string) => (typeof cuerpo[k] === 'string' ? (cuerpo[k] as string) : undefined)
    // `marcas` (lista) es lo nuevo; `marca` (texto) sigue andando para clientes viejos.
    const marcas = Array.isArray(cuerpo.marcas)
      ? cuerpo.marcas.filter((m): m is string => typeof m === 'string')
      : texto('marca')
    const filtros = parsearFiltros(
      { marca: marcas, plataforma: texto('plataforma'), desde: texto('desde'), hasta: texto('hasta') },
      ahora,
    )

    const [publicaciones, publicidad, mensajes] = await Promise.all([
      leerPublicaciones(supabase, ORGANIZACION_PILOTO_ID, filtros.desde, f, filtros.hasta),
      leerPublicidad(supabase, ORGANIZACION_PILOTO_ID, filtros.desde, f, filtros.hasta),
      leerMensajes(supabase, ORGANIZACION_PILOTO_ID, filtros.desde, f, filtros.hasta),
    ])

    const entrada = armarEntrada({
      filtros,
      publicaciones: filtrarPublicaciones(publicaciones.publicaciones, filtros),
      campanias: publicidad.campanias,
      mensajes,
    })
    if (entrada.organico.resumen.publicaciones === 0 && publicidad.campanias.length === 0) {
      return error('No hay publicaciones ni campañas en el período elegido.', 422)
    }

    // Caché: mismos datos + mismo prompt + mismo modelo = mismo análisis, sin cobrar de nuevo.
    const hash = hashEntrada({ organizacionId: ORGANIZACION_PILOTO_ID, entrada, modelo })
    const previo = await buscarPorHash(supabase, hash, f)
    if (previo) return responder({ analisis: vistaDeFila(previo, true, await leerEdiciones(supabase, [previo.id], f)), desdeCache: true }, 200)

    const { texto: salida, uso } = await pedirJson(
      {
        apiKey,
        modelo,
        instrucciones: INSTRUCCIONES,
        respaldo: INSTRUCCIONES_RESPALDO,
        formato: FORMATO_ANALISTA,
        entrada: mensajeUsuario(entrada),
        maxTokensSalida: MAX_TOKENS_SALIDA,
        etiqueta: 'analisis',
      },
      f,
    )
    const costo = costoUsd(modelo, uso)

    let crudo: unknown
    try {
      crudo = JSON.parse(salida)
    } catch {
      crudo = null
    }
    const analisis = validarAnalisisV4(crudo, entrada, 'modelo')
    if (!analisis.ok) {
      // El costo se pierde: se loguea solo eso (nunca el texto del modelo ni claves).
      console.error('analisis: respuesta inválida', { costoUsd: costo })
      return error('El Analista devolvió una respuesta inválida. Probá de nuevo.', 502)
    }
    if (analisis.descartados > 0) console.error('analisis: ítems descartados por citar datos inexistentes', analisis.descartados)

    const fila = {
      organizacion_id: ORGANIZACION_PILOTO_ID,
      tipo: 'rendimiento',
      rango_desde: filtros.desde,
      rango_hasta: filtros.hasta,
      hash_entrada: hash,
      version_prompt: VERSION_PROMPT,
      modelo,
      // La forma validada del modelo; la entrada guardada permite revalidar ediciones y mostrar los datos de origen.
      contenido: JSON.stringify(analisis.analisis),
      formato: 'estructurado',
      entrada,
      tokens_entrada: uso.entrada,
      tokens_salida: uso.salida,
      tokens_cacheados: uso.cacheadas,
      tokens_razonamiento: uso.razonamiento,
      costo_usd: costo,
      filtros,
      creado_por: usuarioId,
    }

    try {
      const creada = await insertar<FilaAnalisis>(supabase, 'analisis', fila, f)
      return responder({ analisis: vistaDeFila(creada, false), desdeCache: false }, 200)
    } catch (e) {
      // Doble click: otro pedido igual ganó la carrera (unique organizacion+hash). Se devuelve ese.
      if (e instanceof ErrorSupabase && e.status === 409) {
        const ganador = await buscarPorHash(supabase, hash, f)
        if (ganador) return responder({ analisis: vistaDeFila(ganador, true, await leerEdiciones(supabase, [ganador.id], f)), desdeCache: true }, 200)
      }
      throw e
    }
  } catch (e) {
    if (e instanceof ErrorOpenAI) {
      console.error('analisis: falló OpenAI', e.tipo, e.status ?? '')
      return error(e.message, e.tipo === 'timeout' ? 504 : 502)
    }
    // Solo nombre y mensaje de errores propios (ErrorSupabase no lleva claves); nunca el objeto entero.
    console.error('analisis: falló', e instanceof ErrorSupabase ? e.message : 'error interno')
    return error('No se pudo completar el análisis. Probá de nuevo en un momento.', 500)
  }
}
