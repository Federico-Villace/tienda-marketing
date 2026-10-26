/**
 * POST /api/promociones/[id]/antecedentes: el paso 2 ("cómo nos fue").
 *
 * Reglas duras que se cumplen en este archivo:
 * - Capa 2: lee de Postgres, nunca sale a Meta (#1).
 * - Al modelo solo le llega armarEntradaPromocion(): agregados que sumó Postgres (#2).
 * - El único gasto (la llamada a OpenAI) pasa por un click humano de un director u
 *   operador, cuesta centavos, se muestra en el botón y se registra con su costo
 *   real (#3). Los rechazos (401/403/404/409/422/503) no llaman a nadie.
 * - Ninguna respuesta ni log lleva OPENAI_API_KEY.
 *
 * El análisis es el mismo de siempre (tabla `analisis`, con su caché por hash y
 * sus ediciones) con tipo 'promocion': /tablero no lo muestra.
 */

import { autorizarAgente } from '../../agentes/autorizar.ts'
import { error, responder, UUID } from '../../agentes/http.ts'
import { ErrorOpenAI, pedirRespuesta } from '../../agentes/openai.ts'
import { costoUsd } from '../../agentes/precios.ts'
import { COLUMNAS_ANALISIS, leerEdiciones, vistaDeFila, type FilaAnalisis } from '../../analista/historial.ts'
import { parsearPeriodo } from '../../datos/filtros.ts'
import { leerMensajes } from '../../datos/mensajes.ts'
import { filasDeComparacion, leerComparacionPromocion, leerResumenPromocion } from '../../datos/promocion.ts'
import { ordenarMarcas } from '../../datos/marcas.ts'
import { ORGANIZACION_PILOTO_ID } from '../../organizacion.ts'
import { ErrorSupabase, insertar, seleccionar, type Supabase } from '../../supabase/rest.ts'
import { respuestaDeError } from '../errores.ts'
import { cuentasDeMarca, marcaPorId, tokenDeMarca } from '../marca.ts'
import { editarPromocion, leerPromocion } from '../repositorio.ts'
import type { FilaPromocion } from '../tipos.ts'
import { vistaDePromocion } from '../vista.ts'
import { armarEntradaPromocion, hashEntradaPromocion } from './entrada.ts'
import { INSTRUCCIONES, mensajeUsuario, VERSION_PROMPT } from './prompt.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

/** El período del body ({ desde?, hasta? }): el mismo criterio que /tablero (ventana de 90 días, ordenado). Sin body, la ventana completa. */
function periodoPedido(pedido: unknown, ahora: Date): { desde: string; hasta: string } {
  const o = typeof pedido === 'object' && pedido !== null ? (pedido as Record<string, unknown>) : {}
  const texto = (v: unknown) => (typeof v === 'string' ? v : undefined)
  return parsearPeriodo({ desde: texto(o.desde), hasta: texto(o.hasta) }, ahora)
}

async function buscarPorHash(s: Supabase, hash: string, f: Fetch): Promise<FilaAnalisis | undefined> {
  const [fila] = await seleccionar<FilaAnalisis>(
    s,
    'analisis',
    { select: COLUMNAS_ANALISIS, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, hash_entrada: `eq.${hash}`, limit: '1' },
    f,
  )
  return fila
}

/**
 * Con qué marcas comparar: las de la tanda de la que la promoción es hija o, si es
 * suelta, las que pida el body (`comparar`). Siempre incluye la propia y se ignora
 * lo que no sea una marca conocida. Menos de 2 marcas = no hay con quién comparar.
 */
async function marcasAComparar(s: Supabase, promo: FilaPromocion, pedido: unknown, f: Fetch): Promise<string[]> {
  let ids: string[] = []
  if (promo.tanda_id) {
    const hijas = await seleccionar<{ marca_id: string }>(
      s,
      'promociones',
      { select: 'marca_id', tanda_id: `eq.${promo.tanda_id}`, estado: 'neq.descartada', organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}` },
      f,
    )
    ids = hijas.map((h) => h.marca_id)
  } else if (typeof pedido === 'object' && pedido !== null && Array.isArray((pedido as { comparar?: unknown }).comparar)) {
    ids = (pedido as { comparar: unknown[] }).comparar.filter((x): x is string => typeof x === 'string')
  }
  const todas = ordenarMarcas([promo.marca_id, ...ids])
  return todas.length >= 2 ? todas : []
}

export async function manejarAntecedentes(
  request: Request,
  id: string,
  entorno: Entorno,
  f: Fetch,
  ahora: Date,
): Promise<Response> {
  const ctx = await autorizarAgente(request, entorno, 'MODELO_ANALISTA', 'pedir antecedentes', f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase, apiKey, modelo } = ctx

  if (!UUID.test(id)) return error('No se encontró la promoción.', 404)
  // El body es opcional ({ comparar?: string[] }); uno roto o vacío no rompe nada.
  const pedido = await request.json().catch(() => null)

  try {
    const promo = await leerPromocion(supabase, id, f)
    if (!promo) return error('No se encontró la promoción.', 404)
    if (promo.estado !== 'borrador') return error('Esta promoción ya no es un borrador.', 409)
    const marca = marcaPorId(promo.marca_id)
    if (!marca) return error('La marca de esta promoción ya no existe.', 422)

    const periodo = periodoPedido(pedido, ahora)
    const resumen = await leerResumenPromocion(
      supabase,
      ORGANIZACION_PILOTO_ID,
      { cuentas: cuentasDeMarca(marca), marca: tokenDeMarca(marca), modelo: promo.modelo, ...periodo },
      f,
    )
    if (resumen.publicaciones === 0 && resumen.campanias.totales.campanias === 0) {
      return error(`Todavía no hay resultados de ${marca.nombre} para comparar. Podés seguir sin este paso.`, 422)
    }

    // Mensajes recibidos (solo conteos, ADR-020/024): otra RPC de lectura; la marca se filtra en armarEntradaPromocion.
    const cuentasMensajes = await leerMensajes(supabase, ORGANIZACION_PILOTO_ID, periodo.desde, f, periodo.hasta)

    // Cómo le fue a las otras marcas con el mismo modelo: otra RPC de lectura (gratis), solo agregados.
    const comparadas = await marcasAComparar(supabase, promo, pedido, f)
    const comparacion = comparadas.length
      ? filasDeComparacion(await leerComparacionPromocion(supabase, ORGANIZACION_PILOTO_ID, { marcaIds: comparadas, modelos: [promo.modelo], ...periodo }, f))
      : []

    const entrada = armarEntradaPromocion(resumen, { marca: marca.nombre, modelo: promo.modelo, datos: promo.datos, periodo, comparacion, mensajes: { marcaId: marca.id, cuentas: cuentasMensajes } })

    // Caché: mismos datos + mismo prompt + mismo modelo = mismo análisis, sin cobrar de nuevo.
    const hash = hashEntradaPromocion({ organizacionId: ORGANIZACION_PILOTO_ID, entrada, modelo })
    const respuesta = async (fila: FilaAnalisis, desdeCache: boolean) => {
      const ediciones = await leerEdiciones(supabase, [fila.id], f)
      const vinculada = promo.analisis_id === fila.id ? promo : await editarPromocion(supabase, promo, { analisis_id: fila.id }, usuarioId, f)
      return responder({ analisis: vistaDeFila(fila, desdeCache, ediciones), desdeCache, promocion: vistaDePromocion(vinculada) }, 200)
    }

    const previo = await buscarPorHash(supabase, hash, f)
    if (previo) return await respuesta(previo, true)

    const { texto: contenido, uso } = await pedirRespuesta(
      { apiKey, modelo, instrucciones: INSTRUCCIONES, entrada: mensajeUsuario(entrada) },
      f,
    )

    const fila = {
      organizacion_id: ORGANIZACION_PILOTO_ID,
      tipo: 'promocion',
      rango_desde: periodo.desde,
      rango_hasta: periodo.hasta,
      hash_entrada: hash,
      version_prompt: VERSION_PROMPT,
      modelo,
      contenido,
      tokens_entrada: uso.entrada,
      tokens_salida: uso.salida,
      tokens_cacheados: uso.cacheadas,
      tokens_razonamiento: uso.razonamiento,
      costo_usd: costoUsd(modelo, uso),
      filtros: {
        promocionId: id,
        marcaId: marca.id,
        modelo: promo.modelo,
        desde: periodo.desde,
        hasta: periodo.hasta,
        ...(comparadas.length ? { comparar: comparadas } : {}),
      },
      creado_por: usuarioId,
    }

    try {
      const creada = await insertar<FilaAnalisis>(supabase, 'analisis', fila, f)
      return await respuesta(creada, false)
    } catch (e) {
      // Doble click: otro pedido igual ganó la carrera (unique organizacion+hash). Se devuelve ese.
      if (e instanceof ErrorSupabase && e.status === 409) {
        const ganador = await buscarPorHash(supabase, hash, f)
        if (ganador) return await respuesta(ganador, true)
      }
      throw e
    }
  } catch (e) {
    if (e instanceof ErrorOpenAI) {
      console.error('promociones: falló OpenAI en los antecedentes', e.tipo, e.status ?? '')
      return error(e.message, e.tipo === 'timeout' ? 504 : 502)
    }
    return respuestaDeError(e, 'los antecedentes')
  }
}
