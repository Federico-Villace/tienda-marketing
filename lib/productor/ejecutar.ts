/**
 * Lo que pasa DESPUÉS de la compuerta, común a la generación suelta (confirmar.ts) y a cada
 * ítem de un lote (lote/ejecutar.ts): pedir las N imágenes a Gemini en paralelo, subirlas
 * al bucket privado, registrar cada creativo y cerrar la generación con su costo real.
 *
 * No decide nada de plata: asume que la generación YA está confirmada y corriendo, y que
 * las fotos de entrada ya se descargaron. El costo real nunca queda null: el cierre se
 * reintenta una vez. Nada de esto tira por una imagen que falle: devuelve su costo.
 */

import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { actualizar, ErrorSupabase, insertar, type Supabase } from '../supabase/rest.ts'
import { firmarUrls, subirObjeto } from '../supabase/storage.ts'
import { dimensionesDe } from './dimensiones.ts'
import { ErrorGemini, pedirImagen } from './gemini.ts'
import { costoDeUso, estimarImagenes, PRECIOS_IMAGEN, type CostoDeUso } from './precios.ts'

type Fetch = typeof fetch

export const BUCKET_CREATIVOS = 'creativos'
export const BUCKET_FOTOS = 'fotos'
const VIGENCIA_URL_S = 3600
const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export type FilaGeneracion = {
  id: string
  estado: string
  motor: string
  cantidad: number
  aspecto: string
  prompt: string
  pieza_id: string | null
  pieza_raiz_id: string | null
  foto_id: string | null
  /** Foto de inspiración: segunda imagen de entrada. Solo viene junto a foto_id. */
  referencia_foto_id: string | null
  costo_estimado_usd: number | string
}

export const COLUMNAS_GENERACION = 'id,estado,motor,cantidad,aspecto,prompt,pieza_id,pieza_raiz_id,foto_id,referencia_foto_id,costo_estimado_usd'

export type VistaCreativo = {
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

export type Cierre = { estado: 'ok' | 'error'; costoRealUsd: number; error: string | null }
export type ImagenEntrada = { readonly bytes: Uint8Array; readonly mimeType: 'image/jpeg' }

export const redondear = (n: number) => Math.round(n * 1e6) / 1e6
const sinCargo: CostoDeUso = { usd: 0, fuente: 'sin_cargo', tokens: { entrada: 0, imagen: 0, texto: 0, pensamiento: 0 } }

/** Genera las `gen.cantidad` imágenes, las guarda y cierra la generación (ok o error, con su costo real). */
export async function ejecutarConfirmada(
  ctx: { readonly supabase: Supabase; readonly apiKey: string },
  gen: FilaGeneracion,
  imagenes: { readonly entrada?: ImagenEntrada; readonly referencia?: ImagenEntrada },
  f: Fetch,
): Promise<{ creativos: VistaCreativo[]; cierre: Cierre }> {
  const { supabase, apiKey } = ctx
  const fotoId = gen.foto_id ?? null
  const conFoto = fotoId !== null
  const conReferencia = conFoto && (gen.referencia_foto_id ?? null) !== null
  const precio = PRECIOS_IMAGEN[gen.motor]!

  const resultados = await Promise.allSettled(Array.from({ length: gen.cantidad }, (_, i) => generarUna(i + 1)))
  const creativos = resultados.map((r, i) =>
    r.status === 'fulfilled' ? r.value.vista : { id: null, orden: i + 1, ruta: null, url: null, ancho: null, alto: null, costoUsd: 0, error: 'Falló la generación.', elegida: false },
  )
  const costoRealUsd = redondear(resultados.reduce((t, r) => t + (r.status === 'fulfilled' ? r.value.costoUsd : 0), 0))
  const fallidas = creativos.filter((c) => c.error)
  const algunaOk = fallidas.length < gen.cantidad
  const primera = fallidas[0]?.error ?? null
  const cierre: Cierre = {
    estado: algunaOk ? 'ok' : 'error',
    costoRealUsd,
    error:
      primera === null
        ? null
        : (fallidas.length === gen.cantidad ? primera : `${fallidas.length} de ${gen.cantidad} imágenes fallaron: ${primera}`).slice(0, 500),
  }

  await cerrarGeneracion(supabase, gen.id, cierre, f)
  return { creativos, cierre }

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
      const r = await pedirImagen(
        { apiKey, modelo: gen.motor, prompt: gen.prompt, aspecto: gen.aspecto as '1:1' | '4:5' | '9:16', pensamiento: precio.pensamiento, imagenEntrada: imagenes.entrada, imagenReferencia: imagenes.referencia },
        f,
      )
      if ('bytes' in r) {
        costo = costoDeUso(gen.motor, r.usage, true)
        const destino = `${ORGANIZACION_PILOTO_ID}/${gen.id}/${orden}.${EXTENSION[r.mimeType] ?? 'jpg'}`
        try {
          await subirObjeto(supabase, BUCKET_CREATIVOS, destino, r.bytes, r.mimeType, f)
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
          ? { ...sinCargo, usd: estimarImagenes(gen.motor, 1, { conFoto, conReferencia }).topePorImagenUsd, fuente: 'tope' }
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
}

/** El costo real NUNCA queda null: se reintenta una vez el cierre. */
export async function cerrarGeneracion(supabase: Supabase, id: string, cierre: Cierre, f: Fetch): Promise<void> {
  for (let intento = 1; intento <= 2; intento++) {
    try {
      await actualizar(
        supabase,
        'generaciones',
        { id },
        { estado: cierre.estado, costo_real_usd: cierre.costoRealUsd, error: cierre.error, terminada_en: new Date().toISOString() },
        f,
      )
      return
    } catch (err) {
      console.error('confirmar: no se pudo cerrar la generación', { id, intento, costoRealUsd: cierre.costoRealUsd, causa: err instanceof ErrorSupabase ? err.message : 'error interno' })
    }
  }
}

/** Lo que se devuelve al navegador: URLs firmadas de vida corta (si el firmado falla las imágenes siguen guardadas). */
export async function cuerpoDeEjecucion(
  supabase: Supabase,
  gen: Pick<FilaGeneracion, 'id' | 'costo_estimado_usd'>,
  resultado: { creativos: VistaCreativo[]; cierre: Cierre },
  f: Fetch,
) {
  let urls = new Map<string, string>()
  try {
    urls = await firmarUrls(supabase, BUCKET_CREATIVOS, resultado.creativos.flatMap((c) => (c.ruta ? [c.ruta] : [])), VIGENCIA_URL_S, f)
  } catch (err) {
    console.error('confirmar: no se pudo firmar', err instanceof ErrorSupabase ? err.message : 'error interno')
  }
  return {
    generacion: {
      id: gen.id,
      estado: resultado.cierre.estado,
      costoRealUsd: resultado.cierre.costoRealUsd,
      costoEstimadoUsd: Number(gen.costo_estimado_usd),
      error: resultado.cierre.error,
    },
    creativos: [...resultado.creativos]
      .sort((a, b) => a.orden - b.orden)
      .map(({ ruta, ...c }) => ({ ...c, url: ruta ? (urls.get(ruta) ?? null) : null })),
  }
}
