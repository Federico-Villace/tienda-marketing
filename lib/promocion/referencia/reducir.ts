/**
 * Achica la foto de referencia ANTES de mandarla a Gemini (solo servidor: usa sharp).
 *
 * Gemini no necesita 2048 px para ubicar cajas: con 1024 px de lado largo la lectura es igual de buena, viaja menos
 * y la respuesta tarda menos (Carbon pasó los 60 s en producción con la foto entera, ADR-039 adenda 2026-11-16).
 * Las cajas que devuelve el modelo son proporciones 0..1, así que reducir no las cambia; las medidas reales de la
 * referencia (las de `fotos`) siguen siendo las de la foto guardada. La proporción se conserva y NUNCA se agranda.
 * La salida es siempre JPEG, por eso el mimeType que se declara es el verdadero.
 */

import sharp from 'sharp'

export const LADO_MAXIMO_LECTURA = 1024
const CALIDAD_JPEG = 80

export type ImagenParaLectura = { readonly bytes: Uint8Array; readonly mimeType: 'image/jpeg' }
export type Reductor = (bytes: Uint8Array) => Promise<ImagenParaLectura>

export const reducirParaLectura: Reductor = async (bytes) => {
  try {
    const salida = await sharp(bytes)
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize({ width: LADO_MAXIMO_LECTURA, height: LADO_MAXIMO_LECTURA, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: CALIDAD_JPEG })
      .toBuffer()
    return { bytes: new Uint8Array(salida), mimeType: 'image/jpeg' }
  } catch {
    throw new Error('El archivo no es una imagen que se pueda leer.')
  }
}
