/** JPEG mínimo armado a mano: SOI, APP0 vacío y SOF0 con las medidas pedidas. */
export const jpegDePrueba = (ancho: number, alto: number, relleno = 0) => {
  const b = new Uint8Array(21 + relleno)
  b.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0, 0, 0, 0, 0x01, 0, 0, 0])
  const v = new DataView(b.buffer)
  v.setUint16(13, alto)
  v.setUint16(15, ancho)
  return b
}
