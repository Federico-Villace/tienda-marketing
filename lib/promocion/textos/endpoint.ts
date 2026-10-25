/**
 * POST /api/promociones/[id]/textos {revision, otras?}: el paso 3 (3 opciones de texto).
 *
 * Reglas duras que se cumplen en este archivo:
 * - Capa 2: lee de Postgres, nunca sale a Meta (#1).
 * - Al modelo solo le llegan los datos que cargó la persona y el texto de los
 *   aprendizajes del paso 2: nunca filas, ids ni claves (#2).
 * - El único gasto (la llamada a OpenAI) pasa por un click humano de un director u
 *   operador, cuesta centavos, se muestra en el botón y se registra con su costo
 *   real (#3). Los rechazos (401/403/404/409/422/503) no llaman a nadie.
 * - Ninguna respuesta ni log lleva OPENAI_API_KEY.
 *
 * Las opciones quedan guardadas (caché por hash) pero NO se elige ninguna: el
 * copy de la promoción queda null hasta que la persona elige (PATCH).
 */

import { autorizarAgente } from '../../agentes/autorizar.ts'
import { pedirJson } from '../../agentes/estructurado.ts'
import { hashJson } from '../../agentes/hash.ts'
import { error, responder, UUID } from '../../agentes/http.ts'
import { ErrorOpenAI } from '../../agentes/openai.ts'
import { costoUsd } from '../../agentes/precios.ts'
import { COLUMNAS_ANALISIS, leerEdiciones, vistaDeFila, type FilaAnalisis } from '../../analista/historial.ts'
import { ORGANIZACION_PILOTO_ID } from '../../organizacion.ts'
import { ErrorSupabase, insertar, seleccionar, type Supabase } from '../../supabase/rest.ts'
import { fuenteMontos, hashDatos } from '../datos.ts'
import { MENSAJE_REVISION, respuestaDeError } from '../errores.ts'
import { marcaPorId } from '../marca.ts'
import { editarPromocion, leerPromocion } from '../repositorio.ts'
import type { CopyPromo } from '../tipos.ts'
import { vistaDePromocion } from '../vista.ts'
import { FORMATO_TEXTOS } from './esquema.ts'
import { INSTRUCCIONES, instruccionesRespaldo, mensajeUsuario, VERSION_PROMPT } from './prompt.ts'
import { validarOpciones } from './validar.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

export const MAX_INTENTOS = 20
const MAX_APRENDIZAJES = 2000

type FilaTextos = {
  id: string
  promocion_id: string
  intento: number
  opciones: CopyPromo[]
  costo_usd: number | string
  datos_hash: string
  creado_en: string
}
const COLUMNAS_TEXTOS = 'id,promocion_id,intento,opciones,costo_usd,datos_hash,creado_en'

async function buscarPorHash(s: Supabase, hash: string, f: Fetch): Promise<FilaTextos | undefined> {
  const [fila] = await seleccionar<FilaTextos>(
    s,
    'textos_promocion',
    { select: COLUMNAS_TEXTOS, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, hash_entrada: `eq.${hash}`, limit: '1' },
    f,
  )
  return fila
}

/** La última vuelta que se pidió para esta promoción; null si nunca se pidieron textos. */
async function ultimoIntento(s: Supabase, promocionId: string, f: Fetch): Promise<number | null> {
  const [fila] = await seleccionar<{ intento: number }>(
    s,
    'textos_promocion',
    { select: 'intento', promocion_id: `eq.${promocionId}`, order: 'intento.desc', limit: '1' },
    f,
  )
  return fila?.intento ?? null
}

/** El texto VIGENTE del análisis del paso 2 (la última edición), recortado. */
async function aprendizajesDe(s: Supabase, analisisId: string | null, f: Fetch): Promise<string | null> {
  if (!analisisId) return null
  const [fila] = await seleccionar<FilaAnalisis>(
    s,
    'analisis',
    { select: COLUMNAS_ANALISIS, id: `eq.${analisisId}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
    f,
  )
  if (!fila) return null
  const vista = vistaDeFila(fila, false, await leerEdiciones(s, [fila.id], f))
  return vista.contenido.slice(0, MAX_APRENDIZAJES)
}

export async function manejarTextos(request: Request, id: string, entorno: Entorno, f: Fetch): Promise<Response> {
  const ctx = await autorizarAgente(request, entorno, 'MODELO_CONTENIDISTA', 'pedir textos', f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase, apiKey, modelo } = ctx

  if (!UUID.test(id)) return error('No se encontró la promoción.', 404)
  const cuerpo = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const revision = cuerpo?.revision
  if (cuerpo === null || typeof cuerpo !== 'object' || typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1) {
    return error('Falta la revisión de la promoción que estás viendo.', 400)
  }
  if (cuerpo.otras !== undefined && typeof cuerpo.otras !== 'boolean') return error('El pedido no es válido.', 400)
  const otras = cuerpo.otras === true

  try {
    const promo = await leerPromocion(supabase, id, f)
    if (!promo) return error('No se encontró la promoción.', 404)
    if (promo.estado !== 'borrador') return error('Esta promoción ya no es un borrador.', 409)
    if (promo.revision !== revision) return error(MENSAJE_REVISION, 409)
    const marca = marcaPorId(promo.marca_id)
    if (!marca) return error('La marca de esta promoción ya no existe.', 422)

    const previo = await ultimoIntento(supabase, id, f)
    const intento = otras ? (previo ?? 0) + 1 : (previo ?? 1)
    if (intento > MAX_INTENTOS) {
      return error('Ya pediste muchas tandas de textos. Elegí una de las opciones y editala a mano.', 422)
    }

    const aprendizajes = await aprendizajesDe(supabase, promo.analisis_id, f)
    const datosHash = hashDatos(promo.datos)

    // Caché: mismos datos + mismos aprendizajes + misma vuelta + mismo prompt y modelo = mismas opciones, sin cobrar de nuevo.
    const hash = hashJson({
      org: ORGANIZACION_PILOTO_ID,
      tipo: 'textos_promocion',
      promocionId: id,
      marcaId: promo.marca_id,
      modelo: promo.modelo,
      datos: promo.datos,
      aprendizajes,
      intento,
      version: VERSION_PROMPT,
      modeloIa: modelo,
    })

    const responderCon = async (fila: FilaTextos, desdeCache: boolean) => {
      const vinculada = promo.textos_id === fila.id ? promo : await editarPromocion(supabase, promo, { textos_id: fila.id }, usuarioId, f)
      return responder(
        {
          textos: {
            id: fila.id,
            opciones: fila.opciones,
            intento: fila.intento,
            costoUsd: desdeCache ? 0 : Number(fila.costo_usd),
            desdeCache,
            // Si cambiaron los datos después de escribir los textos, la pantalla lo avisa.
            desactualizado: fila.datos_hash !== datosHash,
          },
          promocion: vistaDePromocion(vinculada),
        },
        200,
      )
    }

    const guardado = await buscarPorHash(supabase, hash, f)
    if (guardado) return await responderCon(guardado, true)

    const { texto, uso } = await pedirJson(
      {
        apiKey,
        modelo,
        entrada: mensajeUsuario({ marca: marca.nombre, usuarioIg: marca.usuarioIg, modelo: promo.modelo, datos: promo.datos, aprendizajes, intento }),
        instrucciones: INSTRUCCIONES,
        respaldo: instruccionesRespaldo(),
        formato: FORMATO_TEXTOS,
        etiqueta: 'promocion-textos',
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
    const opciones = validarOpciones(crudo, { usuarioIg: marca.usuarioIg, fuente: fuenteMontos(promo.datos) })
    if (!opciones.ok) {
      // El costo se pierde: se loguea solo eso (nunca el texto del modelo ni claves).
      console.error('promociones: textos inválidos', { costoUsd: costo })
      return error('El redactor devolvió textos inválidos. Probá de nuevo.', 502)
    }

    const fila = {
      organizacion_id: ORGANIZACION_PILOTO_ID,
      promocion_id: id,
      hash_entrada: hash,
      version_prompt: VERSION_PROMPT,
      modelo,
      intento,
      opciones: opciones.opciones,
      datos_hash: datosHash,
      tokens_entrada: uso.entrada,
      tokens_salida: uso.salida,
      tokens_cacheados: uso.cacheadas,
      tokens_razonamiento: uso.razonamiento,
      costo_usd: costo,
      creado_por: usuarioId,
    }
    try {
      const creada = await insertar<FilaTextos>(supabase, 'textos_promocion', fila, f)
      return await responderCon(creada, false)
    } catch (e) {
      // Doble click: otro pedido igual ganó la carrera (unique organizacion+hash). Se devuelve ese.
      if (e instanceof ErrorSupabase && e.status === 409) {
        const ganador = await buscarPorHash(supabase, hash, f)
        if (ganador) return await responderCon(ganador, true)
      }
      throw e
    }
  } catch (e) {
    if (e instanceof ErrorOpenAI) {
      console.error('promociones: falló OpenAI en los textos', e.tipo, e.status ?? '')
      return error(e.message, e.tipo === 'timeout' ? 504 : 502)
    }
    return respuestaDeError(e, 'los textos')
  }
}
