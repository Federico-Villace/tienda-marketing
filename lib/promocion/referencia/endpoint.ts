/**
 * POST /api/promociones/[id]/referencia {revision, aceptadoUsd}: LEE la foto de inspiración (modo "Diseño completo") con un
 * modelo de visión y deja la promoción con la plantilla de esa lectura (ADR-039).
 *
 * Es plata (centavos), así que tiene su PROPIA compuerta de costo (regla #3), con el mismo orden inviolable del Productor:
 *   1. autorizar (sesión, rol que no sea lector, GEMINI_API_KEY, tope mensual válido, modelo CON precio)
 *   2. leer la promoción y la foto; descargarla y calcular su sha256 (todo ANTES de reservar)
 *   3. recalcular el precio en el servidor: si no es el que la persona aceptó, 409
 *   4. RPC reservar_lectura_referencia (atómica: caché sin cargo, una sola en vuelo, tope mensual)
 *   5. recién ahí, UNA request a Gemini
 *   6. parseo estricto + reparación (la salida del modelo es entrada NO confiable), cierre con el costo REAL
 *   7. aplicar a la promoción (la lectura queda guardada aunque este paso falle: reintentar es gratis)
 * Todo lo que falla en 1-4 corta sin tocar a Gemini. Ninguna respuesta ni log lleva la clave, la foto ni el texto del modelo.
 */

import { autorizarMiembro } from '../../agentes/autorizar.ts'
import { error, responder, UUID } from '../../agentes/http.ts'
import { HEADER_USUARIO } from '../../auth/acceso.ts'
import { formatearUsdCorto } from '../../costos/formato.ts'
import { ORGANIZACION_PILOTO_ID } from '../../organizacion.ts'
import { leerTope } from '../../productor/autorizar.ts'
import { BUCKET_FOTOS, redondear } from '../../productor/ejecutar.ts'
import { ErrorGemini } from '../../productor/gemini.ts'
import { pedirJsonConImagen } from '../../productor/gemini-vision.ts'
import { ErrorSupabase, rpc, seleccionar, type Supabase } from '../../supabase/rest.ts'
import { descargarObjeto } from '../../supabase/storage.ts'
import { createHash } from 'node:crypto'
import { MENSAJE_REVISION, respuestaDeError } from '../errores.ts'
import { leerPromocion } from '../repositorio.ts'
import type { Diseno } from '../diseno/tipos.ts'
import { PLANTILLAS_DISENO } from '../diseno/catalogo.ts'
import { sinVariacionFueraDeRango, validarDiseno } from '../diseno/validar.ts'
import { logosDeMarca } from '../logos.ts'
import { leerManifiesto } from '../logos-servidor.ts'
import type { FilaPromocion, IdPlantillaDiseno } from '../tipos.ts'
import { vistaDePromocion } from '../vista.ts'
import { extraerJson } from './extraer-json.ts'
import { leerLectura } from './esquema.ts'
import { avisosATexto, COLUMNAS_LECTURA, vistaDeLectura, type FilaLectura, type LecturaVista } from './lectura.ts'
import { costoDeLectura, estimarLectura, modeloDeLectura, tienePrecioVision } from './precios.ts'
import { promptLectura, VERSION_PROMPT_LECTURA, VERSION_REPARACION } from './prompt.ts'
import { repararPlantilla } from './reparar.ts'
import type { Aviso, PlantillaFallback, PlantillaReferencia } from './tipos.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

const MAX_BYTES_FOTO = 10 * 1024 * 1024
const MENSAJE_GENERICO = 'No se pudo leer la referencia. Probá de nuevo en un momento.'

type Contexto = { usuarioId: string; supabase: Supabase; apiKey: string; topeUsd: number; modelo: string }

/** Sesión, rol (el lector no dispara lecturas), clave, tope mensual y un modelo con precio. */
async function autorizar(request: Request, entorno: Entorno, f: Fetch): Promise<Contexto | Response> {
  if (!request.headers.get(HEADER_USUARIO)) return error('Iniciá sesión.', 401)
  if (!entorno.NEXT_PUBLIC_SUPABASE_URL?.trim() || !entorno.SUPABASE_SECRET_KEY?.trim()) return error('Faltan las variables de Supabase.', 500)
  const apiKey = entorno.GEMINI_API_KEY?.trim()
  if (!apiKey) return error('Leer la referencia está apagado: falta GEMINI_API_KEY.', 503)
  const topeUsd = leerTope(entorno.PRESUPUESTO_MENSUAL_USD)
  if (topeUsd === null) return error('Leer la referencia está apagado: falta PRESUPUESTO_MENSUAL_USD.', 503)
  // Un modelo sin precio no se usa: no se gasta lo que no se puede calcular.
  const modelo = modeloDeLectura(entorno)
  if (!tienePrecioVision(modelo)) return error(`El modelo "${modelo}" no tiene precio cargado: no se puede calcular el costo.`, 500)
  const miembro = await autorizarMiembro(request, entorno, 'leer la referencia', f)
  if (miembro instanceof Response) return miembro
  return { usuarioId: miembro.usuarioId, supabase: miembro.supabase, apiKey, topeUsd, modelo }
}

async function restante(supabase: Supabase, topeUsd: number, f: Fetch) {
  const gastadoUsd = redondear(Number(await rpc<number>(supabase, 'gasto_generaciones_mes', { p_org: ORGANIZACION_PILOTO_ID }, f)) || 0)
  return { topeUsd, gastadoUsd, restanteUsd: redondear(Math.max(0, topeUsd - gastadoUsd)) }
}

/**
 * Los ajustes de diseño que sobreviven al cambio de plantilla: los que la nueva acepta, sin el acento (es de la paleta de
 * CADA plantilla) ni lo que es solo de otra (lista, número, lado de la frase). null = todo por defecto.
 */
export function disenoParaPlantilla(previo: Diseno | null, plantilla: IdPlantillaDiseno, fila: Pick<FilaPromocion, 'datos' | 'marca_id'>, acento: Diseno['acento'] | null = null): Diseno | null {
  const conservado: Diseno = { ...(previo ?? {}) }
  delete conservado.acento
  delete conservado.lista
  delete conservado.numero
  delete conservado.posicionFrase
  const logosMarca = logosDeMarca(leerManifiesto(), fila.marca_id).map((l) => l.id)
  const guardado = sinVariacionFueraDeRango(conservado, plantilla)
  const v = validarDiseno(guardado, plantilla, { datos: fila.datos, logosMarca })
  const base: Diseno = v.ok && v.diseno ? { ...v.diseno } : {}
  if (acento) base.acento = acento
  return Object.keys(base).length > 0 ? base : null
}

/** Qué plantilla le toca a la promoción con esta lectura (la propia, o el fallback si no sirvió). */
function camposDeAplicacion(promo: FilaPromocion, lectura: FilaLectura, acentoFallback: Diseno['acento'] | null): Record<string, unknown> {
  const plantilla: IdPlantillaDiseno = lectura.estado === 'lista' ? 'referencia' : (lectura.fallback ?? 'impactante_textura')
  return {
    plantilla,
    referencia_diseno_id: lectura.id,
    // Las plantillas de diseño llevan la moto al centro.
    posicion_moto: 'centro',
    // Sin fondo elegido todavía: el de la plantilla (con la de la referencia, el ambiente sale de la foto de referencia). Uno ya elegido no se toca.
    ...(promo.fondo === null ? { fondo: PLANTILLAS_DISENO[plantilla].fondoSugerido } : {}),
    diseno: disenoParaPlantilla(promo.diseno, plantilla, promo, plantilla === 'referencia' ? null : acentoFallback),
  }
}

type Cierre = { estado: 'lista' | 'inutilizable' | 'error'; crudo: object | null; plantilla: PlantillaReferencia | null; fallback: PlantillaFallback | null; avisos: Aviso[]; costo: number; tokensEntrada: number | null; tokensSalida: number | null; error: string | null }

const cerrar = (supabase: Supabase, id: string, c: Cierre, f: Fetch) =>
  rpc<FilaLectura & { costo_real_usd: number | string | null }>(
    supabase,
    'cerrar_lectura_referencia',
    {
      p_id: id,
      p_estado: c.estado,
      p_crudo: c.crudo,
      p_plantilla: c.plantilla,
      p_fallback: c.fallback,
      p_avisos: avisosATexto(c.avisos),
      p_costo: c.costo,
      p_tokens_entrada: c.tokensEntrada,
      p_tokens_salida: c.tokensSalida,
      p_error: c.error,
    },
    f,
  )

const avisoCosto = (usd: number) => (usd > 0 ? ` Se cobraron ${formatearUsdCorto(usd)}.` : '')

export async function manejarLectura(request: Request, id: string, entorno: Entorno, f: Fetch): Promise<Response> {
  const ctx = await autorizar(request, entorno, f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase, apiKey, topeUsd, modelo } = ctx

  if (!UUID.test(id)) return error('No se encontró la promoción.', 404)
  const cuerpo = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (cuerpo === null || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return error('El pedido no es válido.', 400)
  const { revision, aceptadoUsd } = cuerpo
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1) return error('Falta la revisión de la promoción que estás viendo.', 400)
  if (typeof aceptadoUsd !== 'number' || !Number.isFinite(aceptadoUsd) || aceptadoUsd < 0) return error('Falta el precio que aceptaste.', 400)

  // Lo que se calcula y se compara es siempre lo del servidor: del cuerpo solo se mira si coincide.
  const estimacion = estimarLectura(modelo)
  let reservada: (FilaLectura & { costo_real_usd?: number | string | null }) | null = null
  let costo = 0
  try {
    const promo = await leerPromocion(supabase, id, f)
    if (!promo) return error('No se encontró la promoción.', 404)
    if (promo.estado !== 'borrador') return error('Esta promoción ya no es un borrador.', 409)
    if (promo.revision !== revision) return error(MENSAJE_REVISION, 409)
    if (promo.inspiracion_foto_id === null) return error('Primero elegí una foto de inspiración.', 422)
    if (promo.inspiracion_modo !== 'diseno') return error('Para leer el diseño de la referencia elegí "Diseño completo".', 422)

    // La foto se lee y se descarga ANTES de la compuerta: si Storage falla no queda nada reservado.
    const [foto] = await seleccionar<{ id: string; ruta: string | null; borrada_en: string | null; ancho: number; alto: number }>(
      supabase,
      'fotos',
      { select: 'id,ruta,borrada_en,ancho,alto', id: `eq.${promo.inspiracion_foto_id}`, uso: 'eq.inspiracion', organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
      f,
    )
    if (!foto) return error('No se encontró la foto de inspiración.', 404)
    if (foto.borrada_en !== null || foto.ruta === null) return error('La foto de inspiración se borró: elegí otra.', 410)
    const bytes = await descargarObjeto(supabase, BUCKET_FOTOS, foto.ruta, f)
    if (bytes.length === 0 || bytes.length > MAX_BYTES_FOTO) throw new Error('La foto de inspiración descargada no es válida')
    const sha256 = createHash('sha256').update(bytes).digest('hex')

    // ¿Ya se leyó esta misma foto con este modelo y este prompt? Entonces es gratis y el precio aceptado no importa.
    const [enCache] = await seleccionar<FilaLectura>(
      supabase,
      'referencias_diseno',
      {
        select: COLUMNAS_LECTURA,
        organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`,
        sha256: `eq.${sha256}`,
        modelo: `eq.${modelo}`,
        version_prompt: `eq.${VERSION_PROMPT_LECTURA}`,
        estado: 'in.(lista,inutilizable)',
        limit: '1',
      },
      f,
    )
    if (!enCache && Math.abs(aceptadoUsd - estimacion.topeUsd) > 1e-6) return error('El precio cambió desde que lo viste: volvé a mirarlo.', 409)

    // LA COMPUERTA. Si esto no vuelve bien, Gemini no se toca.
    try {
      reservada = await rpc<FilaLectura>(
        supabase,
        'reservar_lectura_referencia',
        {
          p_org: ORGANIZACION_PILOTO_ID,
          p_foto: foto.id,
          p_sha: sha256,
          p_modelo: modelo,
          p_version: VERSION_PROMPT_LECTURA,
          p_version_reparacion: VERSION_REPARACION,
          p_estimado: estimacion.topeUsd,
          p_tope: topeUsd,
          p_usuario: usuarioId,
        },
        f,
      )
    } catch (e) {
      if (!(e instanceof ErrorSupabase)) throw e
      if (e.status === 402) return responder({ error: 'Supera el tope mensual.', ...(await restante(supabase, topeUsd, f)), estimadoUsd: estimacion.topeUsd }, 402)
      if (e.status === 409) return error('Ya se está leyendo esta referencia: esperá unos segundos.', 409)
      if (e.status === 404) return error('No se encontró la foto de inspiración.', 404)
      throw e
    }

    // Una lectura que ya existía (lista o inutilizable): se aplica, sin cargo y sin llamar a nadie.
    let lectura: FilaLectura = reservada
    let desdeCache = true
    let motivoNuevo: LecturaVista['motivo'] = null
    let avisosNuevos: Aviso[] = []
    let acentoFallback: Diseno['acento'] | null = null

    if (reservada.estado === 'pendiente') {
      desdeCache = false
      let respuesta
      try {
        respuesta = await pedirJsonConImagen(
          { apiKey, modelo, prompt: promptLectura(), imagen: { bytes, mimeType: 'image/jpeg' }, tokensSalidaTope: estimacion.tokensSalidaTope, pensamiento: estimacion.pensamiento },
          f,
        )
      } catch (e) {
        if (!(e instanceof ErrorGemini)) throw e
        // Un timeout pudo haberse cobrado: cuenta el tope. Un error de Google o de red, no.
        const timeout = e.status === 504
        costo = timeout ? estimacion.topeUsd : 0
        await cerrar(supabase, reservada.id, { estado: 'error', crudo: null, plantilla: null, fallback: null, avisos: [], costo, tokensEntrada: null, tokensSalida: null, error: e.message }, f)
        console.error('referencia: falló Gemini', e.status, { costoUsd: costo })
        const status = e.status === 504 ? 504 : e.status === 429 ? 429 : 502
        const mensaje = status === 429 ? 'Gemini está al límite: probá de nuevo en un rato.' : timeout ? 'Gemini tardó demasiado en leer la referencia.' : 'Gemini no pudo leer la referencia.'
        return responder({ error: `${mensaje}${avisoCosto(costo)}`, ...(costo > 0 ? { costoUsd: costo } : {}) }, status)
      }

      const real = costoDeLectura(modelo, respuesta.usage)
      costo = real.usd
      const base = { costo, tokensEntrada: real.tokensEntrada || null, tokensSalida: real.tokensSalida || null }
      const parseada = leerLectura(extraerJson(respuesta.texto))
      if (!parseada.ok) {
        // Se cobra (Google ya cobró) pero no se aplica nada; queda como error para poder reintentar.
        await cerrar(supabase, reservada.id, { ...base, estado: 'error', crudo: null, plantilla: null, fallback: null, avisos: [], error: 'La respuesta no tenía el formato esperado.' }, f)
        console.error('referencia: respuesta inválida', { costoUsd: costo })
        return responder({ error: `La IA devolvió una lectura que no se pudo usar. No se aplicó nada.${avisoCosto(costo)} Podés probar de nuevo.`, costoUsd: costo }, 502)
      }

      // Las medidas de la referencia salen de la foto guardada, nunca de lo que diga el modelo.
      const reparada = repararPlantilla(parseada.lectura, { anchoRef: foto.ancho, altoRef: foto.alto })
      if (reparada.ok) {
        avisosNuevos = reparada.avisos
        lectura = await cerrar(supabase, reservada.id, { ...base, estado: 'lista', crudo: parseada.lectura, plantilla: reparada.plantilla, fallback: null, avisos: avisosNuevos, error: null }, f)
      } else {
        acentoFallback = reparada.acento
        motivoNuevo = reparada.motivo
        lectura = await cerrar(supabase, reservada.id, { ...base, estado: 'inutilizable', crudo: { ...parseada.lectura, motivo: reparada.motivo }, plantilla: null, fallback: reparada.fallback, avisos: [], error: null }, f)
      }
    }
    const vista = vistaDeLectura(lectura)
    if (!vista) throw new Error('La lectura no quedó usable')

    try {
      const actualizada = await rpc<FilaPromocion>(
        supabase,
        'editar_promocion',
        { p_id: promo.id, p_revision: promo.revision, p_campos: camposDeAplicacion(promo, lectura, acentoFallback), p_usuario: usuarioId },
        f,
      )
      return responder(
        {
          promocion: vistaDePromocion(actualizada),
          lectura: { ...vista, ...(motivoNuevo ? { motivo: motivoNuevo } : {}), ...(avisosNuevos.length > 0 ? { avisos: avisosNuevos } : {}) },
          costoUsd: desdeCache ? 0 : costo,
          desdeCache,
        },
        200,
      )
    } catch (e) {
      // Cambió la promoción mientras se leía: la lectura quedó guardada, así que volver a apretar es gratis.
      if (e instanceof ErrorSupabase && e.status === 409) {
        return responder({ error: `${MENSAJE_REVISION} La lectura quedó guardada: al volver a leer no se cobra de nuevo.`, ...(costo > 0 ? { costoUsd: costo } : {}) }, 409)
      }
      throw e
    }
  } catch (e) {
    if (e instanceof ErrorSupabase && (e.status === 404 || e.status === 409 || e.status === 422)) return respuestaDeError(e, 'la lectura de la referencia')
    // Si ya se había reservado y llamado, la persona tiene que saber que se cobró.
    console.error('referencia: falló', e instanceof ErrorSupabase ? e.message : 'error interno', { costoUsd: costo })
    return responder({ error: `${MENSAJE_GENERICO}${avisoCosto(costo)}`, ...(costo > 0 ? { costoUsd: costo } : {}) }, 500)
  }
}
