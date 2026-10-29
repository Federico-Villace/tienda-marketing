/**
 * POST /api/generaciones: paso 1 de la compuerta (regla dura #3).
 *
 * Calcula la estimación EN EL SERVIDOR y la guarda como fila `estimada` que
 * vence a los 15 minutos. No llama a Gemini ni gasta nada. El precio jamás se
 * lee del cliente: cualquier campo de costo en el body se ignora.
 */

import { error, responder, UUID } from '../agentes/http.ts'
import type { Pieza } from '../contenidista/tipos.ts'
import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { composicion, descripcionLimpia, faltaPedidoDeFondo, MENSAJE_FALTA_DESCRIPCION, promptEscena, VERSION_PROMPT_ESCENA } from '../promocion/escena.ts'
import { compartenEscena, escenaEsDe, pedidoEscenaDe } from '../promocion/tanda/escena.ts'
import { combinacionValida, esFondo, esPlantilla, MENSAJE_COSTADO_SIN_LADO, zonaDe, type IdFondo, type IdPlantilla, type PosicionMoto } from '../promocion/tipos.ts'
import { ErrorSupabase, insertar, rpc, seleccionar, type Supabase } from '../supabase/rest.ts'
import { autorizarProductor } from './autorizar.ts'
import { esAspectoFoto, esEdicion, type AspectoFoto, type IdEdicion } from './ediciones.ts'
import { anterioresDe, leerAjuste, promptAjuste, VERSION_PROMPT_AJUSTE } from './ajuste.ts'
import { estimarImagenes, imagenesDeEntrada, MAX_IMAGENES, PRECIOS_IMAGEN, tienePrecioImagen } from './precios.ts'
import { aspectoDe, promptFoto, promptImagen, VERSION_PROMPT_FOTO, VERSION_PROMPT_IMAGEN } from './prompt.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

export const VIGENCIA_ESTIMACION_MS = 15 * 60_000

/**
 * La foto de inspiración de una promoción: tiene que existir como foto de INSPIRACIÓN (no
 * la de otra moto) y seguir viva. Devuelve la respuesta de error o null si está bien.
 */
async function revisarReferencia(supabase: Supabase, id: string, f: Fetch): Promise<Response | null> {
  const [ref] = await seleccionar<{ id: string; ruta: string | null; borrada_en: string | null }>(
    supabase,
    'fotos',
    { select: 'id,ruta,borrada_en', id: `eq.${id}`, uso: 'eq.inspiracion', organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
    f,
  )
  if (!ref) return error('No se encontró la foto de inspiración.', 404)
  if (ref.borrada_en !== null || ref.ruta === null) return error('La foto de inspiración se borró: sacala o subí otra.', 410)
  return null
}

/** Con qué se pide la escena: se guarda en parametros.escena y se muestra después de generar. */
export type EscenaUsada = { fondo: IdFondo; descripcion: string | null; conInspiracion: boolean; posicionMoto: PosicionMoto }

export function escenaUsada(fondo: IdFondo, descripcion: string | null, inspiracion: string | null, posicionMoto: PosicionMoto): EscenaUsada {
  return { fondo, descripcion: descripcionLimpia(descripcion) || null, conInspiracion: inspiracion !== null, posicionMoto }
}

export type Origen =
  | { readonly tipo: 'pieza'; readonly piezaId: string }
  | { readonly tipo: 'foto'; readonly fotoId: string; readonly edicion: IdEdicion; readonly aspecto: AspectoFoto }
  /** La escena de una promoción: foto, fondo, formato y zona libre salen de la promoción, no del pedido. */
  | { readonly tipo: 'promocion'; readonly promocionId: string }
  /** UNA escena para todas las hijas de una tanda (un solo cobro): salen de las hijas, no del pedido. */
  | { readonly tipo: 'tanda'; readonly tandaId: string }
  /** Un cambio pedido sobre una imagen ya generada (ADR-034): hereda el origen de esa imagen. */
  | { readonly tipo: 'ajuste'; readonly creativoId: string; readonly instruccion: string; readonly promocionId: string | null }

/** De dónde sale la imagen: una pieza aprobada, una foto, una promoción o una tanda. Más de una (o ninguna) es un pedido inválido. */
export function leerOrigen(cuerpo: Record<string, unknown>): Origen | { readonly error: string } {
  if (cuerpo.creativoId !== undefined && cuerpo.creativoId !== null) {
    // La promoción puede acompañar al cambio (para validarlo), pero no es el origen: el origen es la imagen.
    const otros = ['piezaId', 'fotoId', 'tandaId'].some((k) => cuerpo[k] !== undefined && cuerpo[k] !== null)
    if (otros) return { error: 'Un cambio parte de una imagen: no mandes también una pieza, una foto o una tanda.' }
    const a = leerAjuste(cuerpo)
    if (!a.ok) return { error: a.error }
    return { tipo: 'ajuste', creativoId: a.creativoId, instruccion: a.instruccion, promocionId: a.promocionId }
  }
  const hayTanda = cuerpo.tandaId !== undefined && cuerpo.tandaId !== null
  if (hayTanda) {
    const otros = ['piezaId', 'fotoId', 'promocionId'].some((k) => cuerpo[k] !== undefined && cuerpo[k] !== null)
    if (otros) return { error: 'Mandá una pieza, una foto, una promoción o una tanda: solo una.' }
    if (typeof cuerpo.tandaId !== 'string' || !UUID.test(cuerpo.tandaId)) return { error: 'Falta la tanda.' }
    return { tipo: 'tanda', tandaId: cuerpo.tandaId }
  }
  const hayPieza = cuerpo.piezaId !== undefined && cuerpo.piezaId !== null
  const hayFoto = cuerpo.fotoId !== undefined && cuerpo.fotoId !== null
  const hayPromo = cuerpo.promocionId !== undefined && cuerpo.promocionId !== null
  if (hayPromo) {
    if (hayPieza || hayFoto) return { error: 'Mandá una pieza, una foto o una promoción: solo una.' }
    if (typeof cuerpo.promocionId !== 'string' || !UUID.test(cuerpo.promocionId)) return { error: 'Falta la promoción.' }
    return { tipo: 'promocion', promocionId: cuerpo.promocionId }
  }
  if (hayPieza && hayFoto) return { error: 'Mandá una pieza o una foto, no las dos.' }
  if (hayFoto) {
    const { fotoId, edicion, aspecto } = cuerpo
    if (typeof fotoId !== 'string' || !UUID.test(fotoId)) return { error: 'Falta la foto.' }
    if (!esEdicion(edicion)) return { error: 'Esa edición no existe.' }
    if (!esAspectoFoto(aspecto)) return { error: 'Ese formato no existe.' }
    return { tipo: 'foto', fotoId, edicion, aspecto }
  }
  if (typeof cuerpo.piezaId !== 'string' || !UUID.test(cuerpo.piezaId)) return { error: 'Falta la pieza.' }
  return { tipo: 'pieza', piezaId: cuerpo.piezaId }
}

export async function manejarEstimacion(
  request: Request,
  entorno: Entorno,
  f: Fetch,
  ahora: () => number = Date.now,
): Promise<Response> {
  const ctx = await autorizarProductor(request, entorno, 'generar imágenes', f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase, topeUsd, motorPorDefecto } = ctx

  // Solo se leen estas tres claves: el resto (precios incluidos) se descarta.
  const cuerpo = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (cuerpo === null || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return error('El pedido no es válido.', 400)
  const origen = leerOrigen(cuerpo)
  if ('error' in origen) return error(origen.error, 400)
  // Un cambio es una dirección: 1 imagen salvo que se pidan más.
  const cantidad = origen.tipo === 'ajuste' && cuerpo.cantidad === undefined ? 1 : cuerpo.cantidad
  if (typeof cantidad !== 'number' || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_IMAGENES) {
    return error(`La cantidad tiene que ser un entero entre 1 y ${MAX_IMAGENES}.`, 400)
  }
  const motor = cuerpo.motor === undefined ? motorPorDefecto : cuerpo.motor
  if (typeof motor !== 'string' || !tienePrecioImagen(motor)) {
    return error(`Motor desconocido. Los disponibles: ${Object.keys(PRECIOS_IMAGEN).join(', ')}.`, 400)
  }

  try {
    // Lo propio de cada origen: qué se guarda como origen, el prompt y si lleva foto de entrada.
    let propio: { prompt: string; version: string; aspecto: string; origen: Record<string, unknown>; extra: Record<string, unknown>; referenciaFotoId?: string; escena?: EscenaUsada; imagenesEntrada?: 0 | 1 | 2 | 3; parametrosExtra?: Record<string, unknown>; ajuste?: { instruccion: string; anteriores: string[] } }
    if (origen.tipo === 'foto') {
      const [foto] = await seleccionar<{ id: string; ruta: string | null; borrada_en: string | null }>(
        supabase,
        'fotos',
        { select: 'id,ruta,borrada_en', id: `eq.${origen.fotoId}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
        f,
      )
      if (!foto) return error('No se encontró la foto.', 404)
      if (foto.borrada_en !== null || foto.ruta === null) return error('La foto se borró.', 410)
      propio = {
        prompt: promptFoto(origen.edicion, origen.aspecto),
        version: VERSION_PROMPT_FOTO,
        aspecto: origen.aspecto,
        origen: { foto_id: foto.id, edicion: origen.edicion },
        extra: { origen: 'foto', edicion: origen.edicion },
      }
    } else if (origen.tipo === 'promocion') {
      const [promo] = await seleccionar<{
        id: string
        estado: string
        foto_id: string
        aspecto: AspectoFoto
        plantilla: string | null
        fondo: string | null
        fondo_descripcion: string | null
        posicion_moto: PosicionMoto
        inspiracion_foto_id: string | null
      }>(
        supabase,
        'promociones',
        { select: 'id,estado,foto_id,aspecto,plantilla,fondo,fondo_descripcion,posicion_moto,inspiracion_foto_id', id: `eq.${origen.promocionId}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
        f,
      )
      if (!promo) return error('No se encontró la promoción.', 404)
      if (promo.estado !== 'borrador') return error('Esta promoción ya no es un borrador.', 409)
      if (!esPlantilla(promo.plantilla) || !esFondo(promo.fondo)) return error('Elegí un diseño primero.', 422)
      if (!combinacionValida(promo.plantilla, promo.posicion_moto)) return error(MENSAJE_COSTADO_SIN_LADO, 422)
      if (faltaPedidoDeFondo(promo.fondo, promo.fondo_descripcion, promo.inspiracion_foto_id !== null)) return error(MENSAJE_FALTA_DESCRIPCION, 422)
      const [foto] = await seleccionar<{ id: string; ruta: string | null; borrada_en: string | null }>(
        supabase,
        'fotos',
        { select: 'id,ruta,borrada_en', id: `eq.${promo.foto_id}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
        f,
      )
      if (!foto) return error('No se encontró la foto.', 404)
      if (foto.borrada_en !== null || foto.ruta === null) return error('La foto se borró.', 410)
      if (promo.inspiracion_foto_id) {
        const mala = await revisarReferencia(supabase, promo.inspiracion_foto_id, f)
        if (mala) return mala
      }
      propio = {
        prompt: promptEscena({
          fondo: promo.fondo,
          zona: zonaDe(promo.plantilla, promo.posicion_moto),
          aspecto: promo.aspecto,
          posicionMoto: promo.posicion_moto,
          descripcion: promo.fondo_descripcion,
          conReferencia: promo.inspiracion_foto_id !== null,
        }),
        version: VERSION_PROMPT_ESCENA,
        aspecto: promo.aspecto,
        origen: { foto_id: foto.id, edicion: 'promocion', promocion_id: promo.id },
        extra: { origen: 'promocion', conInspiracion: promo.inspiracion_foto_id !== null },
        ...(promo.inspiracion_foto_id ? { referenciaFotoId: promo.inspiracion_foto_id } : {}),
        escena: escenaUsada(promo.fondo, promo.fondo_descripcion, promo.inspiracion_foto_id, promo.posicion_moto),
      }
    } else if (origen.tipo === 'tanda') {
      const hijas = (
        await seleccionar<{
          id: string
          estado: string
          foto_id: string
          aspecto: AspectoFoto
          plantilla: string | null
          fondo: string | null
          fondo_descripcion: string | null
          posicion_moto: PosicionMoto
          inspiracion_foto_id: string | null
          grupo?: number | null
        }>(
          supabase,
          'promociones',
          { select: 'id,estado,foto_id,aspecto,plantilla,fondo,fondo_descripcion,posicion_moto,inspiracion_foto_id,grupo', tanda_id: `eq.${origen.tandaId}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, order: 'creado_en.asc' },
          f,
        )
      ).filter((h) => h.estado !== 'descartada')
      const primera = hijas[0]
      if (!primera) return error('No se encontró la tanda.', 404)
      // En un lote de motos cada moto tiene SU escena: se estiman todas juntas por la compuerta de lote (ADR-032).
      if (hijas.some((h) => h.grupo != null)) return error('En un lote de motos cada una tiene su imagen: usá Ver precio del lote.', 422)
      if (hijas.some((h) => h.estado !== 'borrador')) return error('Alguna promoción de la tanda ya no es un borrador.', 409)
      if (hijas.some((h) => !esPlantilla(h.plantilla) || !esFondo(h.fondo))) return error('Elegí un diseño primero.', 422)
      if (!combinacionValida(primera.plantilla as IdPlantilla, primera.posicion_moto)) return error(MENSAJE_COSTADO_SIN_LADO, 422)
      if (faltaPedidoDeFondo(primera.fondo as IdFondo, primera.fondo_descripcion, primera.inspiracion_foto_id !== null)) return error(MENSAJE_FALTA_DESCRIPCION, 422)
      const comparten = compartenEscena(hijas)
      if (!comparten.ok) {
        return responder(
          {
            error: `Las promociones de la tanda no piden la misma imagen: difiere ${comparten.difieren.join(', ')}. Igualalos o generá una imagen por promoción.`,
            difieren: comparten.difieren,
          },
          422,
        )
      }
      const [foto] = await seleccionar<{ id: string; ruta: string | null; borrada_en: string | null }>(
        supabase,
        'fotos',
        { select: 'id,ruta,borrada_en', id: `eq.${primera.foto_id}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
        f,
      )
      if (!foto) return error('No se encontró la foto.', 404)
      if (foto.borrada_en !== null || foto.ruta === null) return error('La foto se borró.', 410)
      if (primera.inspiracion_foto_id) {
        const mala = await revisarReferencia(supabase, primera.inspiracion_foto_id, f)
        if (mala) return mala
      }
      propio = {
        prompt: promptEscena(pedidoEscenaDe(primera)),
        version: VERSION_PROMPT_ESCENA,
        aspecto: primera.aspecto,
        origen: { foto_id: foto.id, edicion: 'promocion', tanda_id: origen.tandaId },
        extra: { origen: 'tanda', promociones: hijas.length, conInspiracion: primera.inspiracion_foto_id !== null },
        ...(primera.inspiracion_foto_id ? { referenciaFotoId: primera.inspiracion_foto_id } : {}),
        escena: escenaUsada(primera.fondo as IdFondo, primera.fondo_descripcion, primera.inspiracion_foto_id, primera.posicion_moto),
      }
    } else if (origen.tipo === 'ajuste') {
      const [creativo] = await seleccionar<{ id: string; generacion_id: string; ruta: string | null; aspecto: string }>(
        supabase,
        'creativos',
        { select: 'id,generacion_id,ruta,aspecto', id: `eq.${origen.creativoId}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
        f,
      )
      if (!creativo) return error('No se encontró la imagen.', 404)
      if (creativo.ruta === null) return error('Esa imagen no se guardó: no se puede cambiar.', 410)
      const [base] = await seleccionar<{
        id: string
        foto_id: string | null
        edicion: string | null
        pieza_id: string | null
        pieza_raiz_id: string | null
        promocion_id: string | null
        tanda_id: string | null
        grupo: number | null
        parametros: unknown
      }>(
        supabase,
        'generaciones',
        { select: 'id,foto_id,edicion,pieza_id,pieza_raiz_id,promocion_id,tanda_id,grupo,parametros', id: `eq.${creativo.generacion_id}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
        f,
      )
      if (!base || !esAspectoFoto(creativo.aspecto)) return error('No se encontró la imagen.', 404)

      // Una imagen de promoción o de tanda solo se cambia desde esa promoción, mientras es borrador.
      let composicionLibre: string | null = null
      if (base.promocion_id !== null || base.tanda_id !== null) {
        if (origen.promocionId === null) return error('Falta la promoción de esta imagen.', 400)
      }
      if (origen.promocionId !== null) {
        const [promo] = await seleccionar<{ id: string; estado: string; aspecto: string; plantilla: string | null; posicion_moto: PosicionMoto; tanda_id: string | null; grupo: number | null }>(
          supabase,
          'promociones',
          { select: 'id,estado,aspecto,plantilla,posicion_moto,tanda_id,grupo', id: `eq.${origen.promocionId}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
          f,
        )
        if (!promo) return error('No se encontró la promoción.', 404)
        if (promo.estado !== 'borrador') return error('Volvé a editar la promoción para pedir cambios.', 409)
        if (!escenaEsDe(base, promo)) return error('Esa imagen no es de esta promoción.', 422)
        if (promo.aspecto !== creativo.aspecto) return error('Esa imagen no tiene el formato de esta promoción.', 422)
        if (esPlantilla(promo.plantilla)) composicionLibre = composicion(zonaDe(promo.plantilla, promo.posicion_moto), promo.posicion_moto)
      }

      if (base.foto_id !== null) {
        const [foto] = await seleccionar<{ id: string; ruta: string | null; borrada_en: string | null }>(
          supabase,
          'fotos',
          { select: 'id,ruta,borrada_en', id: `eq.${base.foto_id}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
          f,
        )
        if (!foto || foto.borrada_en !== null || foto.ruta === null) return error('La foto original se borró: no se puede cambiar esta imagen.', 410)
      }

      const anteriores = anterioresDe(base.parametros)
      propio = {
        prompt: promptAjuste({ instruccion: origen.instruccion, anteriores, conFoto: base.foto_id !== null, composicion: composicionLibre, aspecto: creativo.aspecto }),
        version: VERSION_PROMPT_AJUSTE,
        aspecto: creativo.aspecto,
        // Hereda el origen de la imagen base. Nunca lote_id ni referencia (los prohíben checks de la base).
        origen: {
          ...(base.foto_id !== null ? { foto_id: base.foto_id, edicion: base.edicion } : { pieza_id: base.pieza_id, pieza_raiz_id: base.pieza_raiz_id }),
          ...(base.promocion_id !== null ? { promocion_id: base.promocion_id } : {}),
          ...(base.promocion_id === null && base.tanda_id !== null ? { tanda_id: base.tanda_id, ...(base.grupo !== null ? { grupo: base.grupo } : {}) } : {}),
          base_creativo_id: creativo.id,
          instruccion: origen.instruccion,
        },
        extra: { origen: 'ajuste' },
        imagenesEntrada: imagenesDeEntrada({ base_creativo_id: creativo.id, foto_id: base.foto_id }),
        parametrosExtra: { ajuste: { instruccion: origen.instruccion, anteriores, baseCreativoId: creativo.id } },
        ajuste: { instruccion: origen.instruccion, anteriores },
      }
    } else {
      const [fila] = await seleccionar<{ id: string; raiz_id: string; estado: string; pieza: Pieza }>(
        supabase,
        'piezas',
        { select: 'id,raiz_id,estado,pieza', id: `eq.${origen.piezaId}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
        f,
      )
      if (!fila) return error('No se encontró la pieza.', 404)
      if (fila.estado !== 'aprobada') return error('Solo se generan imágenes de piezas aprobadas.', 422)
      const aspecto = aspectoDe(fila.pieza.formato, fila.pieza.plataforma)
      if (!aspecto) return error(`El formato "${fila.pieza.formato}" no genera imágenes: solo imagen, carrusel e historia.`, 422)
      propio = {
        prompt: promptImagen(fila.pieza, aspecto),
        version: VERSION_PROMPT_IMAGEN,
        aspecto,
        origen: { pieza_id: fila.id, pieza_raiz_id: fila.raiz_id },
        extra: {},
      }
    }
    const { aspecto } = propio

    const e = estimarImagenes(
      motor,
      cantidad,
      propio.imagenesEntrada !== undefined
        ? { imagenesEntrada: propio.imagenesEntrada }
        : { conFoto: origen.tipo !== 'pieza', conReferencia: propio.referenciaFotoId !== undefined },
    )
    const venceEn = new Date(ahora() + VIGENCIA_ESTIMACION_MS).toISOString()
    const creada = await insertar<{ id: string }>(
      supabase,
      'generaciones',
      {
        organizacion_id: ORGANIZACION_PILOTO_ID,
        tipo: 'imagen',
        motor,
        prompt: propio.prompt,
        parametros: {
          aspecto,
          image_size: '1K',
          mime_type: 'image/jpeg',
          thinking: PRECIOS_IMAGEN[motor]!.pensamiento,
          // Con qué se pidió la escena (trazabilidad): el prompt completo ya queda en `prompt`.
          ...(propio.escena ? { escena: propio.escena } : {}),
          ...propio.parametrosExtra,
        },
        cantidad,
        aspecto,
        ...propio.origen,
        ...(propio.referenciaFotoId ? { referencia_foto_id: propio.referenciaFotoId } : {}),
        creado_por: usuarioId,
        version_prompt: propio.version,
        // Lo que se guarda y se compara con el tope es el TOPE por imagen (conservador).
        costo_estimado_usd: e.topeTotalUsd,
        vence_en: venceEn,
      },
      f,
    )
    const gastadoUsd = Number(await rpc<number>(supabase, 'gasto_generaciones_mes', { p_org: ORGANIZACION_PILOTO_ID }, f)) || 0

    return responder(
      {
        id: creada.id,
        costoEstimadoUsd: e.topeTotalUsd,
        generacion: {
          id: creada.id,
          motor,
          cantidad,
          aspecto,
          ...propio.extra,
          ...(propio.escena ? { escena: propio.escena } : {}),
          porImagenUsd: e.porImagenUsd,
          listaUsd: e.totalUsd,
          costoEstimadoUsd: e.topeTotalUsd,
          venceEn,
        },
        ...(propio.ajuste ? { ajuste: propio.ajuste } : {}),
        mes: { gastadoUsd, topeUsd },
        excedeTope: gastadoUsd + e.topeTotalUsd > topeUsd,
      },
      201,
    )
  } catch (err) {
    console.error('generaciones: falló', err instanceof ErrorSupabase ? err.message : 'error interno')
    return error('No se pudo preparar la estimación. Probá de nuevo en un momento.', 500)
  }
}
