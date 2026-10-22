import { describe, it, expect } from 'vitest'
import { jpegDePrueba } from './foto-fixture'
import { DECLARACION_DERECHOS_V1, LIMITES_FOTO, validarFoto } from './foto'

describe('validarFoto (F5)', () => {
  it('S5.1 un JPEG dentro de los límites devuelve sus medidas', () => {
    expect(validarFoto(jpegDePrueba(2048, 1536))).toEqual({ ancho: 2048, alto: 1536 })
    expect(validarFoto(jpegDePrueba(512, 512))).toEqual({ ancho: 512, alto: 512 })
  })

  it('S5.2 un archivo vacío es 400', () => {
    expect(validarFoto(new Uint8Array())).toMatchObject({ status: 400 })
  })

  it('S5.3 más de 4.000.000 de bytes es 413', () => {
    expect(validarFoto(jpegDePrueba(1024, 1024, LIMITES_FOTO.maxBytes))).toMatchObject({ status: 413 })
    // justo en el límite entra
    expect(validarFoto(jpegDePrueba(1024, 1024, LIMITES_FOTO.maxBytes - 21))).toEqual({ ancho: 1024, alto: 1024 })
  })

  it('S5.4 PNG, WebP y texto disfrazados de .jpg son 415', () => {
    const png = new Uint8Array(33)
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
    new DataView(png.buffer).setUint32(16, 1024)
    new DataView(png.buffer).setUint32(20, 1024)
    const webp = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 xxxxxxxx')
    for (const b of [png, webp, new TextEncoder().encode('hola')]) {
      expect(validarFoto(b)).toMatchObject({ status: 415, error: 'Solo se aceptan fotos JPEG.' })
    }
  })

  it('S5.5 un JPEG sin SOF legible es 415', () => {
    expect(validarFoto(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]))).toMatchObject({ status: 415 })
  })

  it('S5.6 el lado mayor >2048 o el menor <512 es 422', () => {
    expect(validarFoto(jpegDePrueba(2049, 1536))).toMatchObject({ status: 422 })
    expect(validarFoto(jpegDePrueba(1536, 2049))).toMatchObject({ status: 422 })
    expect(validarFoto(jpegDePrueba(2048, 511))).toMatchObject({ status: 422 })
    expect(validarFoto(jpegDePrueba(0, 0))).toMatchObject({ status: 422 })
  })
})

describe('constantes', () => {
  it('límites y declaración de derechos versionada', () => {
    expect(LIMITES_FOTO).toEqual({ maxBytes: 4_000_000, maxLado: 2048, minLado: 512, maxContentLength: 4_200_000 })
    expect(DECLARACION_DERECHOS_V1.version).toBe('derechos-v1')
    expect(DECLARACION_DERECHOS_V1.texto).toMatch(/derecho a usar esta foto/)
  })
})
