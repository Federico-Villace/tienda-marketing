/**
 * POST /api/generaciones/[id]/ejecutar: la ejecución de UNA imagen de un lote ya confirmado
 * (ADR-032). El navegador la llama una vez por moto, de a 2 en paralelo, así cada request
 * cabe en maxDuration 300 s (≤ 2 imágenes de hasta 120 s).
 *
 * NO confirma ni cobra: la compuerta ya pasó (confirmar_lote_generacion) y este ítem cuenta en
 * el tope por su estimado. Orden:
 *   1. autorizar y leer el ítem (tiene que ser de un lote)
 *   2. RPC iniciar_generacion_lote (confirmada → corriendo; PT409 si ya corre o ya terminó:
 *      dos pestañas no pueden generar lo mismo dos veces)
 *   3. descargar las fotos; si ya no están (se borraron después de confirmar) se cierra el
 *      ítem en error con costo 0, sin llamar a Gemini
 *   4. ejecutarConfirmada: las N imágenes, el costo real y el cierre
 */

import { error, responder, UUID } from '../../agentes/http.ts'
import { ORGANIZACION_PILOTO_ID } from '../../organizacion.ts'
import { ErrorSupabase, rpc, seleccionar, type Supabase } from '../../supabase/rest.ts'
import { descargarObjeto } from '../../supabase/storage.ts'
import { autorizarProductor } from '../autorizar.ts'
import { BUCKET_FOTOS, cerrarGeneracion, COLUMNAS_GENERACION, cuerpoDeEjecucion, ejecutarConfirmada, type FilaGeneracion, type ImagenEntrada } from '../ejecutar.ts'
import { MAX_IMAGENES, tienePrecioImagen } from '../precios.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

type FilaItem = FilaGeneracion & { lote_id: string | null }

class FotoNoDisponible extends Error {
  constructor(
    readonly status: 404 | 410,
    mensaje: string,
  ) {
    super(mensaje)
  }
}

/** Baja una foto viva. Si no existe o se borró: FotoNoDisponible (404 / 410). */
async function bajarFoto(supabase: Supabase, id: string, uso: 'moto' | 'inspiracion', f: Fetch): Promise<ImagenEntrada> {
  const [foto] = await seleccionar<{ id: string; ruta: string | null; borrada_en: string | null }>(
    supabase,
    'fotos',
    { select: 'id,ruta,borrada_en', id: `in.(${id})`, uso: `eq.${uso}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
    f,
  )
  const cual = uso === 'moto' ? 'La foto de la moto' : 'La foto de inspiración'
  if (!foto) throw new FotoNoDisponible(404, `${cual} no se encontró: no se generó nada ni se cobró.`)
  if (foto.borrada_en !== null || foto.ruta === null) throw new FotoNoDisponible(410, `${cual} se borró: no se generó nada ni se cobró.`)
  const bytes = await descargarObjeto(supabase, BUCKET_FOTOS, foto.ruta, f)
  if (bytes.length === 0) throw new Error('La foto descargada está vacía')
  return { bytes, mimeType: 'image/jpeg' }
}

export async function manejarEjecucion(request: Request, id: string, entorno: Entorno, f: Fetch): Promise<Response> {
  const ctx = await autorizarProductor(request, entorno, 'generar imágenes', f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase, apiKey } = ctx

  if (!UUID.test(id)) return error('No se encontró la generación.', 404)

  try {
    const [gen] = await seleccionar<FilaItem>(
      supabase,
      'generaciones',
      { select: `${COLUMNAS_GENERACION},lote_id`, id: `eq.${id}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
      f,
    )
    if (!gen) return error('No se encontró la generación.', 404)
    // Solo se ejecutan ítems de un lote confirmado: una generación suelta se confirma y corre en un solo paso.
    if (gen.lote_id === null) return error('Ya se está generando o ya terminó.', 409)
    if (!tienePrecioImagen(gen.motor) || !Number.isInteger(gen.cantidad) || gen.cantidad < 1 || gen.cantidad > MAX_IMAGENES || gen.foto_id === null) {
      console.error('ejecutar: generación con motor o cantidad inválidos', { id })
      return error('Esta imagen no se puede generar: motor o cantidad inválidos.', 500)
    }

    // Confirmada → corriendo, una sola vez. Si no vuelve bien, Gemini no se toca.
    try {
      await rpc(supabase, 'iniciar_generacion_lote', { p_id: gen.id, p_usuario: usuarioId }, f)
    } catch (err) {
      if (!(err instanceof ErrorSupabase)) throw err
      if (err.status === 409) return error('Ya se está generando o ya terminó.', 409)
      if (err.status === 404) return error('No se encontró la generación.', 404)
      throw err
    }

    // Las fotos se bajan acá (no al confirmar): si ya no están, el ítem queda en error con costo 0.
    let entrada: ImagenEntrada
    let referencia: ImagenEntrada | undefined
    try {
      entrada = await bajarFoto(supabase, gen.foto_id, 'moto', f)
      if (gen.referencia_foto_id !== null) referencia = await bajarFoto(supabase, gen.referencia_foto_id, 'inspiracion', f)
    } catch (err) {
      const mensaje = err instanceof FotoNoDisponible ? err.message : 'No se pudo leer la foto: no se generó nada ni se cobró.'
      await cerrarGeneracion(supabase, gen.id, { estado: 'error', costoRealUsd: 0, error: mensaje }, f)
      if (err instanceof FotoNoDisponible) return error(mensaje, err.status)
      console.error('ejecutar: no se pudo leer la foto', { id, causa: err instanceof ErrorSupabase ? err.message : 'error interno' })
      return error(mensaje, 500)
    }

    const resultado = await ejecutarConfirmada({ supabase, apiKey }, gen, { entrada, referencia }, f)
    return responder(await cuerpoDeEjecucion(supabase, gen, resultado, f), 200)
  } catch (err) {
    console.error('ejecutar: falló', err instanceof ErrorSupabase ? err.message : 'error interno')
    return error('No se pudo completar la generación. Revisá el lote antes de reintentar.', 500)
  }
}
