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
import { actualizar, ErrorSupabase, insertar, rpc, seleccionar, type Supabase } from '../supabase/rest.ts'
import { descargarObjeto, firmarUrls, subirObjeto } from '../supabase/storage.ts'
import { autorizarProductor } from './autorizar.ts'
import { dimensionesDe } from './dimensiones.ts'
import { ErrorGemini, pedirImagen } from './gemini.ts'
import { costoDeUso, estimarImagenes, MAX_IMAGENES, PRECIOS_IMAGEN, tienePrecioImagen, type CostoDeUso } from './precios.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

const BUCKET = 'creativos'
const BUCKET_FOTOS = 'fotos'
const VIGENCIA_URL_S = 3600
const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

type FilaGeneracion = {
  id: string
  estado: string
  motor: string
  cantidad: number
  aspecto: string
  prompt: string
  pieza_id: string | null
  pieza_raiz_id: string | null
  foto_id: string | null
  costo_estimado_usd: number | string
}

type VistaCreativo = {
  id: string | null
  orden: number
  ruta: string | null
  url: string | null
  ancho: number | null
  alto: number | null
  costoUsd: number
  error: string | null
  elegida: boolean
}

const redondear = (n: number) => Math.round(n * 1e6) / 1e6
const sinCargo: CostoDeUso = { usd: 0, fuente: 'sin_cargo', tokens: { entrada: 0, imagen: 0, texto: 0, pensamiento: 0 } }

async function restante(supabase: Supabase, topeUsd: number, f: Fetch) {
  const gastadoUsd = redondear(Number(await rpc<number>(supabase, 'gasto_generaciones_mes', { p_org: ORGANIZACION_PILOTO_ID }, f)) || 0)
  return { topeUsd, gastadoUsd, restanteUsd: redondear(Math.max(0, topeUsd - gastadoUsd)) }
}

export async function manejarConfirmacion(request: Request, id: string, entorno: Entorno, f: Fetch): Promise<Response> {
  const ctx = await autorizarProductor(request, entorno, 'confirmar generaciones', f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase, apiKey, topeUsd } = ctx

  if (!UUID.test(id)) return error('No se encontró la generación.', 404)

  let gen: FilaGeneracion
  let creativosListos: VistaCreativo[]
  let cierre: { estado: 'ok' | 'error'; costoRealUsd: number; error: string | null }

  try {
    const [fila] = await seleccionar<FilaGeneracion>(
      supabase,
      'generaciones',
      {
        select: 'id,estado,motor,cantidad,aspecto,prompt,pieza_id,pieza_raiz_id,foto_id,costo_estimado_usd',
        id: `eq.${id}`,
        organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`,
        limit: '1',
      },
      f,
    )
    if (!fila) return error('No se encontró la generación.', 404)
    gen = fila

    // El precio se recalcula en el servidor: un motor sin precio no se ejecuta.
    if (!tienePrecioImagen(gen.motor) || !Number.isInteger(gen.cantidad) || gen.cantidad < 1 || gen.cantidad > MAX_IMAGENES) {
      console.error('confirmar: generación con motor o cantidad inválidos', { id })
      return error('Esta generación no se puede ejecutar: motor o cantidad inválidos.', 500)
    }
    const fotoId = gen.foto_id ?? null
    const conFoto = fotoId !== null
    const e = estimarImagenes(gen.motor, gen.cantidad, { conFoto })
    if (Math.abs(e.topeTotalUsd - Number(gen.costo_estimado_usd)) > 1e-6) {
      return error('El precio cambió desde la estimación: estimá de nuevo.', 409)
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
    const imagenEntrada = original ? ({ bytes: original, mimeType: 'image/jpeg' } as const) : undefined

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

    const precio = PRECIOS_IMAGEN[gen.motor]!
    const resultados = await Promise.allSettled(
      Array.from({ length: gen.cantidad }, (_, i) => generarUna(i + 1)),
    )
    creativosListos = resultados.map((r, i) =>
      r.status === 'fulfilled' ? r.value.vista : { id: null, orden: i + 1, ruta: null, url: null, ancho: null, alto: null, costoUsd: 0, error: 'Falló la generación.', elegida: false },
    )
    const costoRealUsd = redondear(resultados.reduce((t, r) => t + (r.status === 'fulfilled' ? r.value.costoUsd : 0), 0))
    const fallidas = creativosListos.filter((c) => c.error)
    const algunaOk = fallidas.length < gen.cantidad
    const primera = fallidas[0]?.error ?? null
    cierre = {
      estado: algunaOk ? 'ok' : 'error',
      costoRealUsd,
      error:
        primera === null
          ? null
          : (fallidas.length === gen.cantidad ? primera : `${fallidas.length} de ${gen.cantidad} imágenes fallaron: ${primera}`).slice(0, 500),
    }

    // El costo real NUNCA queda null: se reintenta una vez el cierre.
    for (let intento = 1; intento <= 2; intento++) {
      try {
        await actualizar(
          supabase,
          'generaciones',
          { id: gen.id },
          { estado: cierre.estado, costo_real_usd: cierre.costoRealUsd, error: cierre.error, terminada_en: new Date().toISOString() },
          f,
        )
        break
      } catch (err) {
        console.error('confirmar: no se pudo cerrar la generación', { id: gen.id, intento, costoRealUsd, causa: err instanceof ErrorSupabase ? err.message : 'error interno' })
      }
    }

    // Cada imagen: pedir → subir → registrar. Nada de esto tira: devuelve su costo.
    async function generarUna(orden: number): Promise<{ vista: VistaCreativo; costoUsd: number }> {
      const origen = fotoId !== null ? { foto_id: fotoId } : { pieza_id: gen.pieza_id, pieza_raiz_id: gen.pieza_raiz_id }
      const base = { organizacion_id: ORGANIZACION_PILOTO_ID, generacion_id: gen.id, ...origen, orden, aspecto: gen.aspecto }
      let costo: CostoDeUso = sinCargo
      let ruta: string | null = null
      let mime: string | null = null
      let dims: { ancho: number; alto: number } | null = null
      let mensaje: string | null = null

      try {
        const r = await pedirImagen({ apiKey, modelo: gen.motor, prompt: gen.prompt, aspecto: gen.aspecto as '1:1' | '4:5' | '9:16', pensamiento: precio.pensamiento, imagenEntrada }, f)
        if ('bytes' in r) {
          costo = costoDeUso(gen.motor, r.usage, true)
          const destino = `${ORGANIZACION_PILOTO_ID}/${gen.id}/${orden}.${EXTENSION[r.mimeType] ?? 'jpg'}`
          try {
            await subirObjeto(supabase, BUCKET, destino, r.bytes, r.mimeType, f)
            ruta = destino
            mime = r.mimeType
            dims = dimensionesDe(r.bytes)
          } catch (err) {
            console.error('confirmar: no se pudo subir la imagen', { id: gen.id, orden, causa: err instanceof ErrorSupabase ? err.message : 'error interno' })
            mensaje = 'No se pudo guardar la imagen.'
          }
        } else {
          costo = costoDeUso(gen.motor, r.usage, false)
          mensaje = r.sinImagen
        }
      } catch (err) {
        const status = err instanceof ErrorGemini ? err.status : 0
        mensaje = err instanceof ErrorGemini ? err.message : 'Falló la generación.'
        // Un timeout puede haberse cobrado: se registra el tope. El resto no tuvo respuesta: 0.
        costo =
          status === 504
            ? { ...sinCargo, usd: estimarImagenes(gen.motor, 1, { conFoto }).topePorImagenUsd, fuente: 'tope' }
            : sinCargo
      }

      const fila = {
        ...base,
        ruta,
        mime_type: mime,
        ancho: dims?.ancho ?? null,
        alto: dims?.alto ?? null,
        costo_usd: costo.usd,
        costo_fuente: costo.fuente,
        tokens_entrada: costo.tokens.entrada,
        tokens_imagen: costo.tokens.imagen,
        tokens_texto: costo.tokens.texto,
        tokens_pensamiento: costo.tokens.pensamiento,
        error: mensaje === null ? null : mensaje.slice(0, 500),
      }
      let idCreativo: string | null = null
      try {
        idCreativo = (await insertar<{ id: string }>(supabase, 'creativos', fila, f)).id
      } catch (err) {
        console.error('confirmar: no se pudo registrar el creativo', { id: gen.id, orden, causa: err instanceof ErrorSupabase ? err.message : 'error interno' })
        if (ruta !== null) mensaje = 'No se pudo registrar la imagen.'
      }
      return {
        costoUsd: costo.usd,
        vista: { id: idCreativo, orden, ruta, url: null, ancho: fila.ancho, alto: fila.alto, costoUsd: costo.usd, error: fila.error ?? mensaje, elegida: false },
      }
    }
  } catch (err) {
    console.error('confirmar: falló', err instanceof ErrorSupabase ? err.message : 'error interno')
    return error('No se pudo completar la generación. Revisá el historial antes de reintentar.', 500)
  }

  // URLs firmadas de vida corta. Si el firmado falla las imágenes siguen guardadas.
  let urls = new Map<string, string>()
  try {
    urls = await firmarUrls(supabase, BUCKET, creativosListos.flatMap((c) => (c.ruta ? [c.ruta] : [])), VIGENCIA_URL_S, f)
  } catch (err) {
    console.error('confirmar: no se pudo firmar', err instanceof ErrorSupabase ? err.message : 'error interno')
  }

  return responder(
    {
      generacion: {
        id: gen.id,
        estado: cierre.estado,
        costoRealUsd: cierre.costoRealUsd,
        costoEstimadoUsd: Number(gen.costo_estimado_usd),
        error: cierre.error,
      },
      creativos: creativosListos
        .sort((a, b) => a.orden - b.orden)
        .map(({ ruta, ...c }) => ({ ...c, url: ruta ? (urls.get(ruta) ?? null) : null })),
    },
    200,
  )
}
