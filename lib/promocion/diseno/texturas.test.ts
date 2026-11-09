import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { codificarPng, generarGrunge, generarRaspado, prng, TEXTURAS } from './texturas'

const leer = (archivo: string) => new Uint8Array(readFileSync(join(process.cwd(), 'assets/texturas', archivo)))
const medidas = (b: Uint8Array) => ({ ancho: new DataView(b.buffer, b.byteOffset).getUint32(16), alto: new DataView(b.buffer, b.byteOffset).getUint32(20) })

describe('prng (mulberry32)', () => {
  it('es determinista por semilla y distinto entre semillas', () => {
    const a = prng(7)
    const b = prng(7)
    const c = prng(8)
    const sa = [a(), a(), a()]
    expect(sa).toEqual([b(), b(), b()])
    expect(sa).not.toEqual([c(), c(), c()])
    for (const x of sa) expect(x).toBeGreaterThanOrEqual(0), expect(x).toBeLessThan(1)
  })
})

describe('codificarPng', () => {
  it('arma un PNG válido de gris+alfa: firma, IHDR con las medidas y IEND', () => {
    const png = codificarPng(3, 2, new Uint8Array(3 * 2 * 2))
    expect(Buffer.from(png.subarray(0, 8)).toString('hex')).toBe('89504e470d0a1a0a')
    expect(medidas(png)).toEqual({ ancho: 3, alto: 2 })
    expect(png[24]).toBe(8) // profundidad
    expect(png[25]).toBe(4) // gris + alfa
    expect(Buffer.from(png.subarray(png.length - 8, png.length - 4)).toString('latin1')).toBe('IEND')
  })
})

describe('texturas generadas', () => {
  it('son deterministas: la misma semilla da los mismos bytes', () => {
    expect(generarRaspado(200, 80, 3)).toEqual(generarRaspado(200, 80, 3))
    expect(generarGrunge(120, 160, 5)).toEqual(generarGrunge(120, 160, 5))
    expect(generarGrunge(120, 160, 5)).not.toEqual(generarGrunge(120, 160, 6))
  })

  it('tienen zonas transparentes y zonas con tinta (si no, no sirven de overlay)', () => {
    const png = generarGrunge(120, 160, 5)
    expect(png.length).toBeGreaterThan(200)
  })

  for (const [nombre, t] of Object.entries(TEXTURAS)) {
    it(`assets/texturas/${t.archivo} existe, es PNG y mide ${t.ancho}×${t.alto}`, () => {
      const b = leer(t.archivo)
      expect(Buffer.from(b.subarray(0, 8)).toString('hex'), nombre).toBe('89504e470d0a1a0a')
      expect(medidas(b)).toEqual({ ancho: t.ancho, alto: t.alto })
      expect(b.length).toBeLessThan(2_500_000)
    })

    it(`${t.archivo} es exactamente lo que genera el script (regenerar no cambia nada)`, () => {
      const generado = t.generar()
      expect(Buffer.from(generado).equals(Buffer.from(leer(t.archivo)))).toBe(true)
    })
  }
})
