import { describe, it, expect } from 'vitest'
import { dimensionesDe } from './dimensiones'

const png = (ancho: number, alto: number) => {
  const b = new Uint8Array(33)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  b.set([0x49, 0x48, 0x44, 0x52], 12)
  new DataView(b.buffer).setUint32(16, ancho)
  new DataView(b.buffer).setUint32(20, alto)
  return b
}

const jpeg = (ancho: number, alto: number) => {
  // SOI, APP0 (largo 4), SOF0 (largo 11)
  const b = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0, 0, 0, 0, 0x01, 0, 0, 0])
  new DataView(b.buffer).setUint16(13, alto)
  new DataView(b.buffer).setUint16(15, ancho)
  return b
}

describe('dimensionesDe', () => {
  it('lee el IHDR de un PNG', () => expect(dimensionesDe(png(1024, 1280))).toEqual({ ancho: 1024, alto: 1280 }))
  it('lee el SOF de un JPEG saltando segmentos', () => expect(dimensionesDe(jpeg(896, 1152))).toEqual({ ancho: 896, alto: 1152 }))
  it('devuelve null si no entiende el formato', () => {
    expect(dimensionesDe(new Uint8Array([1, 2, 3]))).toBeNull()
    expect(dimensionesDe(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull()
  })
})
