/**
 * POST /api/generaciones/[id]/confirmar: paso 2 de la compuerta (regla dura #3).
 *
 * El ÚNICO camino que gasta plata. Orden inviolable:
 *   1. autorizar (sesión, rol, GEMINI_API_KEY, tope válido)
 *   2. leer la generación y RECALCULAR el precio en el servidor
 *   3. RPC confirmar_generacion (atómica: vencimiento, doble click, tope mensual)
 *   4. recién ahí, N requests a Gemini en paralelo
 * Cualquier fallo en 1-3 corta antes de la primera llamada a Gemini. El body se
 * ignora por completo: el cliente no manda precio, tope ni usuario.
 *
 * Cada imagen se guarda en el bucket privado y devuelve una URL firmada; el
 * base64 nunca sale del servidor. El costo real queda siempre como un número.
 */

import { error, responder, UUID } from '../agentes/http.ts'
import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { actualizar, ErrorSupabase, rpc, seleccionar, type Supabase } from '../supabase/rest.ts'
import { descargarObjeto } from '../supabase/storage.ts'
import { autorizarProductor } from './autorizar.ts'
import { BUCKET_CREATIVOS, BUCKET_FOTOS, COLUMNAS_GENERACION, cuerpoDeEjecucion, ejecutarConfirmada, redondear, type FilaGeneracion, type ImagenEntrada } from './ejecutar.ts'
import { estimarImagenes, imagenesDeEntrada, MAX_IMAGENES, tienePrecioImagen } from './precios.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

async function restante(supabase: Supabase, topeUsd: number, f: Fetch) {
  const gastadoUsd = redondear(Number(await rpc<number>(supabase, 'gasto_generaciones_mes', { p_org: ORGANIZACION_PILOTO_ID }, f)) || 0)
  return { topeUsd, gastadoUsd, restanteUsd: redondear(Math.max(0, topeUsd - gastadoUsd)) }
}

export async function manejarConfirmacion(request: Request, id: string, entorno: Entorno, f: Fetch): Promise<Response> {
  const ctx = await autorizarProductor(request, entorno, 'confirmar generaciones', f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase, apiKey, topeUsd } = ctx

  if (!UUID.test(id)) return error('No se encontró la generación.', 404)

  try {
    const [fila] = await seleccionar<FilaGeneracion>(
      supabase,
      'generaciones',
      {
        select: COLUMNAS_GENERACION,
        id: `eq.${id}`,
        organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`,
        limit: '1',
      },
      f,
    )
    if (!fila) return error('No se encontró la generación.', 404)
    const gen = fila

    // El precio se recalcula en el servidor: un motor sin precio no se ejecuta.
    if (!tienePrecioImagen(gen.motor) || !Number.isInteger(gen.cantidad) || gen.cantidad < 1 || gen.cantidad > MAX_IMAGENES) {
      console.error('confirmar: generación con motor o cantidad inválidos', { id })
      return error('Esta generación no se puede ejecutar: motor o cantidad inválidos.', 500)
    }
    const fotoId = gen.foto_id ?? null
    // La referencia solo existe junto a la foto de la moto (la base lo exige con un check).
    const referenciaId = fotoId !== null ? (gen.referencia_foto_id ?? null) : null
    const baseId = gen.base_creativo_id ?? null
    const e = estimarImagenes(gen.motor, gen.cantidad, {
      imagenesEntrada: imagenesDeEntrada({ foto_id: fotoId, referencia_foto_id: referenciaId, base_creativo_id: baseId }),
    })
    if (Math.abs(e.topeTotalUsd - Number(gen.costo_estimado_usd)) > 1e-6) {
      return error('El precio cambió desde la estimación: estimá de nuevo.', 409)
    }

    // Un cambio sobre una imagen generada parte de ESA imagen (1ª entrada) y, si la tiene, de la foto
    // real de la moto (2ª entrada, para que la moto no se degrade). Todo se descarga ANTES de la compuerta.
    let imagenBase: { bytes: Uint8Array; mimeType: ImagenEntrada['mimeType'] } | undefined
    if (baseId !== null) {
      const [base] = await seleccionar<{ ruta: string | null; mime_type: string | null }>(
        supabase,
        'creativos',
        { select: 'ruta,mime_type', id: `eq.${baseId}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
        f,
      )
      if (!base) return error('No se encontró la imagen a cambiar.', 404)
      if (base.ruta === null) return error('La imagen a cambiar no se guardó.', 410)
      const bytes = await descargarObjeto(supabase, BUCKET_CREATIVOS, base.ruta, f)
      if (bytes.length === 0) throw new Error('La imagen base descargada está vacía')
      imagenBase = { bytes, mimeType: base.mime_type === 'image/png' || base.mime_type === 'image/webp' ? base.mime_type : 'image/jpeg' }
    }

    // Una edición de foto lee y descarga el original ANTES de la compuerta: si
    // Storage falla no se confirma nada y no queda ninguna fila contando en el tope.
    let original: Uint8Array | null = null
    if (fotoId !== null) {
      const [foto] = await seleccionar<{ ruta: string | null; borrada_en: string | null }>(
        supabase,
        'fotos',
        { select: 'ruta,borrada_en', id: `eq.${fotoId}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
        f,
      )
      if (!foto) return error('No se encontró la foto.', 404)
      if (foto.borrada_en !== null || foto.ruta === null) return error('La foto se borró.', 410)
      original = await descargarObjeto(supabase, BUCKET_FOTOS, foto.ruta, f)
      if (original.length === 0) throw new Error('La foto descargada está vacía')
    }
    const fotoReal = original ? ({ bytes: original, mimeType: 'image/jpeg' } as const) : undefined
    const imagenEntrada = imagenBase ?? fotoReal

    // La foto de inspiración se lee y se descarga igual, también ANTES de la compuerta.
    let referencia: Uint8Array | null = null
    if (referenciaId !== null) {
      const [ref] = await seleccionar<{ ruta: string | null; borrada_en: string | null }>(
        supabase,
        'fotos',
        { select: 'ruta,borrada_en', id: `eq.${referenciaId}`, uso: 'eq.inspiracion', organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
        f,
      )
      if (!ref) return error('No se encontró la foto de inspiración.', 404)
      if (ref.borrada_en !== null || ref.ruta === null) return error('La foto de inspiración se borró: estimá de nuevo sin ella.', 410)
      referencia = await descargarObjeto(supabase, BUCKET_FOTOS, ref.ruta, f)
      if (referencia.length === 0) throw new Error('La foto de inspiración descargada está vacía')
    }
    const imagenReferencia = imagenBase ? fotoReal : referencia ? ({ bytes: referencia, mimeType: 'image/jpeg' } as const) : undefined

    // LA COMPUERTA. Si esto no vuelve bien, Gemini no se toca.
    try {
      await rpc(supabase, 'confirmar_generacion', { p_id: gen.id, p_tope: topeUsd, p_usuario: usuarioId }, f)
    } catch (err) {
      if (!(err instanceof ErrorSupabase)) throw err
      if (err.status === 402) {
        return responder({ error: 'Supera el tope mensual.', ...(await restante(supabase, topeUsd, f)), estimadoUsd: e.topeTotalUsd }, 402)
      }
      if (err.status === 409) return error('Ya se confirmó: no se vuelve a cobrar.', 409)
      if (err.status === 410) return error('La estimación venció: estimá de nuevo.', 410)
      if (err.status === 404) return error('No se encontró la generación.', 404)
      throw err
    }

    await actualizar(supabase, 'generaciones', { id: gen.id }, { estado: 'corriendo' }, f)

    const resultado = await ejecutarConfirmada({ supabase, apiKey }, gen, { entrada: imagenEntrada, referencia: imagenReferencia }, f)
    return responder(await cuerpoDeEjecucion(supabase, gen, resultado, f), 200)
  } catch (err) {
    console.error('confirmar: falló', err instanceof ErrorSupabase ? err.message : 'error interno')
    return error('No se pudo completar la generación. Revisá el historial antes de reintentar.', 500)
  }
}
