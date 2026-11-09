/** Ancho y alto de un PNG (IHDR), JPEG (SOF) o WebP sin decodificar. null si no se entiende. */

export type Dimensiones = { readonly ancho: number; readonly alto: number }

const ascii = (b: Uint8Array, desde: number, largo: number) => String.fromCharCode(...b.subarray(desde, desde + largo))
const esWebp = (b: Uint8Array) => b.length >= 16 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP'

export type FormatoImagen = 'png' | 'jpeg' | 'webp'

/** Qué es, por los bytes (no por la extensión). null si no es ninguno de los tres. */
export function formatoDe(bytes: Uint8Array): FormatoImagen | null {
  if (bytes.length >= 4 && [0x89, 0x50, 0x4e, 0x47].every((b, i) => bytes[i] === b)) return 'png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg'
  if (esWebp(bytes)) return 'webp'
  return null
}

/** WebP: VP8 (con pérdida), VP8L (sin pérdida) o VP8X (extendido). */
function dimensionesWebp(b: Uint8Array): Dimensiones | null {
  const trozo = ascii(b, 12, 4)
  if (trozo === 'VP8 ' && b.length >= 30) return { ancho: (b[26]! | (b[27]! << 8)) & 0x3fff, alto: (b[28]! | (b[29]! << 8)) & 0x3fff }
  if (trozo === 'VP8L' && b.length >= 25 && b[20] === 0x2f) {
    const bits = (b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)) >>> 0
    return { ancho: (bits & 0x3fff) + 1, alto: ((bits >>> 14) & 0x3fff) + 1 }
  }
  if (trozo === 'VP8X' && b.length >= 30) {
    return { ancho: (b[24]! | (b[25]! << 8) | (b[26]! << 16)) + 1, alto: (b[27]! | (b[28]! << 8) | (b[29]! << 16)) + 1 }
  }
  return null
}

export function dimensionesDe(bytes: Uint8Array): Dimensiones | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (esWebp(bytes)) return dimensionesWebp(bytes)
  const firmaPng = [0x89, 0x50, 0x4e, 0x47]
  if (bytes.length >= 24 && firmaPng.every((b, i) => bytes[i] === b)) {
    return { ancho: v.getUint32(16), alto: v.getUint32(20) }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2
    while (i + 4 <= bytes.length) {
      if (bytes[i] !== 0xff) return null
      const marcador = bytes[i + 1]!
      const largo = v.getUint16(i + 2)
      const esSof = marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)
      if (esSof) {
        if (i + 9 > bytes.length) return null
        return { alto: v.getUint16(i + 5), ancho: v.getUint16(i + 7) }
      }
      i += 2 + largo
    }
  }
  return null
}
