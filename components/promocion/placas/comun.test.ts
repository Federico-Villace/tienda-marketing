import { describe, it, expect } from 'vitest'
import { mascaraEscena } from './comun'

const svgDe = (css: string) => decodeURIComponent(css.replace(/^url\("data:image\/svg\+xml;utf8,/, '').replace(/"\)$/, ''))

describe('mascaraEscena (la escena se funde por los cuatro bordes)', () => {
  const css = mascaraEscena(1080, 620, 0.08, 0.16, 0.2)
  const svg = svgDe(css)

  it('es un url() de un SVG del tamaño de la caja, sin comillas que rompan el CSS', () => {
    expect(css.startsWith('url("data:image/svg+xml;utf8,')).toBe(true)
    expect(css.endsWith('")')).toBe(true)
    expect(css.slice(5, -2)).not.toContain('"')
    expect(svg).toContain('width="1080" height="620"')
  })

  it('es UNA sola máscara con los dos ejes: cada degradé arranca y termina TRANSPARENTE, así ningún borde queda con filo', () => {
    for (const id of ['h', 'v']) {
      const g = new RegExp(`<linearGradient id="${id}"[^>]*>(.*?)</linearGradient>`).exec(svg)![1]!
      const stops = [...g.matchAll(/<stop offset="([\d.]+)"[^>]*?(stop-opacity="0")?\/>/g)].map((m) => [Number(m[1]), m[2] !== undefined])
      expect(stops[0]).toEqual([0, true])
      expect(stops.at(-1)).toEqual([1, true])
    }
  })

  it('las franjas de fundido salen de los parámetros (el centro queda opaco)', () => {
    expect(svg).toMatch(/id="h"[^>]*x2="1" y2="0"[\s\S]*offset="0.08"[\s\S]*offset="0.92"/)
    expect(svg).toMatch(/id="v"[^>]*x2="0" y2="1"[\s\S]*offset="0.16"[\s\S]*offset="0.8"/)
  })
})
