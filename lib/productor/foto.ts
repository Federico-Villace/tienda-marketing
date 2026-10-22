/**
 * Validación pura de la foto que sube el cliente. El navegador ya la
 * re-encodeó a JPEG, pero el servidor no confía: revisa tamaño, magic y medidas
 * de lo que llegó (Next trunca en silencio los cuerpos grandes).
 */

import { dimensionesDe } from './dimensiones.ts'

export const LIMITES_FOTO = {
  maxBytes: 4_000_000,
  maxLado: 2048,
  minLado: 512,
  /** Vercel corta a 4,5 MB: se rechaza antes de parsear el multipart. */
  maxContentLength: 4_200_000,
} as const

/** Cambiar el texto obliga a subir la versión: queda guardada con cada foto. */
export const DECLARACION_DERECHOS_V1 = {
  version: 'derechos-v1',
  texto:
    'Tengo derecho a usar esta foto (es nuestra o tenemos permiso) y, si aparecen personas, dieron su consentimiento.',
} as const

export type ResultadoValidacionFoto = { ancho: number; alto: number } | { error: string; status: 400 | 413 | 415 | 422 }

export function validarFoto(bytes: Uint8Array): ResultadoValidacionFoto {
  if (bytes.length === 0) return { error: 'La foto está vacía.', status: 400 }
  if (bytes.length > LIMITES_FOTO.maxBytes) return { error: 'La foto pesa demasiado (máximo 4 MB).', status: 413 }
  const esJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (!esJpeg) return { error: 'Solo se aceptan fotos JPEG.', status: 415 }
  const medidas = dimensionesDe(bytes)
  if (!medidas) return { error: 'Solo se aceptan fotos JPEG.', status: 415 }
  const mayor = Math.max(medidas.ancho, medidas.alto)
  const menor = Math.min(medidas.ancho, medidas.alto)
  if (mayor > LIMITES_FOTO.maxLado || menor < LIMITES_FOTO.minLado) {
    return {
      error: `La foto tiene que medir entre ${LIMITES_FOTO.minLado} y ${LIMITES_FOTO.maxLado} píxeles de lado.`,
      status: 422,
    }
  }
  return { ancho: medidas.ancho, alto: medidas.alto }
}
