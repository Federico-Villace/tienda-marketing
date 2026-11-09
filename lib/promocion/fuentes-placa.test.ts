import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fuentesDe, IDS_FUENTE, REGISTRO_FUENTES } from './fuentes-placa'
import { IDS_PLANTILLA, IDS_PLANTILLA_DISENO } from './tipos'

const dir = join(process.cwd(), 'assets/fuentes')
const bytes = (archivo: string) => new Uint8Array(readFileSync(join(dir, archivo)))
const magia = (b: Uint8Array) => Buffer.from(b.subarray(0, 4)).toString('hex')

describe('registro de fuentes de la placa', () => {
  it('cada fuente del registro existe y es un TTF/OTF de verdad (satori no lee woff2)', () => {
    for (const id of IDS_FUENTE) {
      const f = REGISTRO_FUENTES[id]
      const b = bytes(f.archivo)
      expect(['00010000', '4f54544f'], `${f.archivo}: ${magia(b)}`).toContain(magia(b))
      expect(b.length).toBeGreaterThan(10_000)
    }
  })

  it('ninguna es una fuente variable (satori no las soporta): sin tabla fvar', () => {
    for (const id of IDS_FUENTE) {
      const b = bytes(REGISTRO_FUENTES[id].archivo)
      const tablas = new Set<string>()
      const n = new DataView(b.buffer, b.byteOffset).getUint16(4)
      for (let i = 0; i < n; i++) tablas.add(Buffer.from(b.subarray(12 + 16 * i, 16 + 16 * i)).toString('latin1'))
      expect(tablas.has('fvar'), id).toBe(false)
    }
  })

  it('cada familia trae su licencia OFL junto al archivo', () => {
    const familias = new Set(IDS_FUENTE.map((id) => REGISTRO_FUENTES[id].licencia))
    expect(familias.size).toBeGreaterThanOrEqual(6)
    for (const l of familias) expect(readFileSync(join(dir, l), 'utf8')).toMatch(/SIL Open Font License/)
  })

  it('las nuevas llevan los acentos y la ñ del castellano (se verifican en la tabla cmap)', () => {
    // Un chequeo barato: la letra Ñ (U+00D1) tiene que estar mapeada. Si faltara, satori dibuja un recuadro.
    for (const id of ['kaushan', 'barlow-condensed', 'archivo-expanded', 'sora-extrabold', 'sora-semibold'] as const) {
      expect(tieneGlifos(bytes(REGISTRO_FUENTES[id].archivo), 'ÁÉÍÓÚÑ'), id).toBe(true)
    }
  })

  it('peso y estilo coinciden con el nombre del archivo', () => {
    expect(REGISTRO_FUENTES['barlow-condensed']).toMatchObject({ peso: 800, estilo: 'italic' })
    expect(REGISTRO_FUENTES['archivo-expanded']).toMatchObject({ peso: 800, estilo: 'italic' })
    expect(REGISTRO_FUENTES['sora-extrabold']).toMatchObject({ familia: 'Sora', peso: 800, estilo: 'normal' })
    expect(REGISTRO_FUENTES['sora-semibold']).toMatchObject({ familia: 'Sora', peso: 600 })
    expect(REGISTRO_FUENTES.anton.peso).toBe(400)
  })
})

describe('fuentesDe(plantilla)', () => {
  it('las clásicas siguen con Anton e Inter, nada más', () => {
    for (const id of IDS_PLANTILLA) expect(fuentesDe(id)).toEqual(['anton', 'inter'])
  })
  it('cada plantilla de diseño carga solo las suyas', () => {
    expect(fuentesDe('impactante_textura')).toEqual(['anton', 'kaushan', 'barlow-condensed'])
    expect(fuentesDe('deportiva')).toEqual(['archivo-expanded', 'barlow-condensed'])
    expect(fuentesDe('editorial')).toEqual(['sora-extrabold', 'sora-semibold'])
    for (const id of IDS_PLANTILLA_DISENO) for (const f of fuentesDe(id)) expect(IDS_FUENTE).toContain(f)
  })
})

/** ¿La fuente tiene glifo para cada carácter? Lee la tabla cmap (formatos 4 y 12). */
function tieneGlifos(b: Uint8Array, texto: string): boolean {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const n = v.getUint16(4)
  let cmap = -1
  for (let i = 0; i < n; i++) if (Buffer.from(b.subarray(12 + 16 * i, 16 + 16 * i)).toString('latin1') === 'cmap') cmap = v.getUint32(12 + 16 * i + 8)
  const subtablas = v.getUint16(cmap + 2)
  const mapeados = new Set<number>()
  for (let i = 0; i < subtablas; i++) {
    const s = cmap + v.getUint32(cmap + 4 + 8 * i + 4)
    const formato = v.getUint16(s)
    if (formato === 4) {
      const segs = v.getUint16(s + 6) / 2
      for (let k = 0; k < segs; k++) {
        const fin = v.getUint16(s + 14 + 2 * k)
        const ini = v.getUint16(s + 16 + 2 * segs + 2 * k)
        for (const ch of texto) if (ch.codePointAt(0)! >= ini && ch.codePointAt(0)! <= fin) mapeados.add(ch.codePointAt(0)!)
      }
    } else if (formato === 12) {
      const grupos = v.getUint32(s + 12)
      for (let k = 0; k < grupos; k++) {
        const ini = v.getUint32(s + 16 + 12 * k)
        const fin = v.getUint32(s + 20 + 12 * k)
        for (const ch of texto) if (ch.codePointAt(0)! >= ini && ch.codePointAt(0)! <= fin) mapeados.add(ch.codePointAt(0)!)
      }
    }
  }
  return [...texto].every((ch) => mapeados.has(ch.codePointAt(0)!))
}
