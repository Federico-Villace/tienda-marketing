/**
 * POST /api/fotos: sube la foto real de una moto para editarla después.
 *
 * No cuesta plata: exige sesión y rol, pero NO Gemini ni tope. El cliente ya
 * comprimió y re-encodeó a JPEG (se va el EXIF), pero el servidor no confía:
 * revisa el content-length ANTES de parsear, la declaración de derechos, el
 * magic y las medidas. Sube con la clave secreta (regla #5: el cliente nunca
 * escribe en Storage ni en la base).
 */

import { autorizarMiembro } from '../agentes/autorizar.ts'
import { error, responder } from '../agentes/http.ts'
import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { ErrorSupabase, insertar } from '../supabase/rest.ts'
import { borrarObjetos, firmarUrls, subirObjeto } from '../supabase/storage.ts'
import { DECLARACION_DERECHOS_V1, LIMITES_FOTO, validarFoto } from './foto.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

export const BUCKET_FOTOS = 'fotos'
export const VIGENCIA_URL_FOTO_S = 3600

const msj = (e: unknown) => (e instanceof ErrorSupabase ? e.message : 'error interno')

export async function manejarSubidaFoto(
  request: Request,
  entorno: Entorno,
  f: Fetch,
  nuevoId: () => string = () => crypto.randomUUID(),
  ahora: () => number = Date.now,
): Promise<Response> {
  const ctx = await autorizarMiembro(request, entorno, 'subir fotos', f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase } = ctx

  // Antes de parsear: Vercel corta a 4,5 MB y no hay por qué bufferear un cuerpo enorme.
  const largo = Number(request.headers.get('content-length'))
  if (Number.isFinite(largo) && largo > LIMITES_FOTO.maxContentLength) return error('La foto pesa demasiado (máximo 4 MB).', 413)

  const form = await request.formData().catch(() => null)
  if (!form) return error('El pedido no es válido.', 400)

  // Sin la declaración no se toca Storage.
  if (form.get('derechos') !== 'acepto') return error('Tenés que confirmar que tenés derecho a usar esta foto.', 422)

  const archivo = form.get('foto')
  if (archivo === null || typeof archivo === 'string') return error('Falta la foto.', 400)
  const bytes = new Uint8Array(await archivo.arrayBuffer())

  const validada = validarFoto(bytes)
  if ('error' in validada) return error(validada.error, validada.status)

  const id = nuevoId()
  const ruta = `${ORGANIZACION_PILOTO_ID}/${id}.jpg`
  try {
    await subirObjeto(supabase, BUCKET_FOTOS, ruta, bytes, 'image/jpeg', f)
  } catch (e) {
    console.error('fotos: falló la subida', msj(e))
    return error('No se pudo guardar la foto. Probá de nuevo en un momento.', 500)
  }

  try {
    await insertar(
      supabase,
      'fotos',
      {
        id,
        organizacion_id: ORGANIZACION_PILOTO_ID,
        ruta,
        mime_type: 'image/jpeg',
        ancho: validada.ancho,
        alto: validada.alto,
        bytes: bytes.length,
        subida_por: usuarioId,
        derechos_por: usuarioId,
        derechos_en: new Date(ahora()).toISOString(),
        derechos_version: DECLARACION_DERECHOS_V1.version,
      },
      f,
    )
  } catch (e) {
    console.error('fotos: falló el registro', msj(e))
    // Sin fila no hay quién use el objeto: se intenta no dejar huérfanos.
    await borrarObjetos(supabase, BUCKET_FOTOS, [ruta], f).catch((x) => console.error('fotos: no se pudo limpiar', msj(x)))
    return error('No se pudo guardar la foto. Probá de nuevo en un momento.', 500)
  }

  // La foto ya quedó guardada: si la firma falla, la pantalla la firma al recargar.
  const url = await firmarUrls(supabase, BUCKET_FOTOS, [ruta], VIGENCIA_URL_FOTO_S, f)
    .then((m) => m.get(ruta) ?? null)
    .catch((e) => {
      console.error('fotos: no se pudo firmar', msj(e))
      return null
    })

  return responder({ foto: { id, ancho: validada.ancho, alto: validada.alto, url } }, 201)
}
