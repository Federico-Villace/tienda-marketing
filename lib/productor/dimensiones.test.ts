import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dimensionesDe, formatoDe } from './dimensiones'

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

const webp = (trozo: string, carga: number[]) => {
  const b = new Uint8Array(12 + 8 + carga.length)
  b.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0)
  b.set([...'WEBP'].map((c) => c.charCodeAt(0)), 8)
  b.set([...trozo].map((c) => c.charCodeAt(0)), 12)
  b.set(carga, 20)
  return b
}

describe('dimensionesDe · WebP', () => {
  it('lee un WebP sin pérdida (VP8L): el logo real de Benelli es de 676×211', () => {
    const bytes = new Uint8Array(readFileSync('assets/logos/benelli-store-quilmes/benelli-blanco.webp'))
    expect(dimensionesDe(bytes)).toEqual({ ancho: 676, alto: 211 })
  })
  it('lee un WebP con pérdida (VP8)', () => {
    const carga = new Array(10).fill(0)
    carga.splice(6, 4, 0x20, 0x03, 0x58, 0x02) // 800 × 600 (little-endian, a partir del byte 26)
    expect(dimensionesDe(webp('VP8 ', carga))).toEqual({ ancho: 800, alto: 600 })
  })
  it('lee un WebP extendido (VP8X): ancho-1 y alto-1 en 24 bits', () => {
    const carga = new Array(18).fill(0)
    carga.splice(4, 6, 0x1f, 0x03, 0x00, 0xf9, 0x01, 0x00) // 800 × 506
    expect(dimensionesDe(webp('VP8X', carga))).toEqual({ ancho: 800, alto: 506 })
  })
})

describe('formatoDe', () => {
  it('distingue png, jpeg y webp por los bytes, no por la extensión', () => {
    expect(formatoDe(png(1, 1))).toBe('png')
    expect(formatoDe(jpeg(1, 1))).toBe('jpeg')
    expect(formatoDe(webp('VP8L', [0, 0, 0, 0, 0]))).toBe('webp')
    expect(formatoDe(new Uint8Array([1, 2, 3, 4]))).toBeNull()
  })
})
