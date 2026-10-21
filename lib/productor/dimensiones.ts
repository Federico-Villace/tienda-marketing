/** Ancho y alto de un PNG (IHDR) o JPEG (SOF) sin decodificar. null si no se entiende. */

export type Dimensiones = { readonly ancho: number; readonly alto: number }

export function dimensionesDe(bytes: Uint8Array): Dimensiones | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
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
