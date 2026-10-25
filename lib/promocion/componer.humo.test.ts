// @vitest-environment node
// Prueba de humo: dibuja de verdad con next/og (satori + resvg) y las fuentes commiteadas.
// Si en algún entorno next/og no corre bajo vitest, se deja solo el test con render inyectado
// (componer.test.ts) y la prueba manual de docs/08 §19.
import { describe, it, expect } from 'vitest'
import { componerPlaca } from './componer'
import { dimensionesDe } from '../productor/dimensiones'
import { escenaDePrueba, MIME_ESCENA_PRUEBA } from './escena-fixture'

const textos = {
  marca: 'Benelli Store Quilmes',
  modelo: 'TRK 502',
  precio: '$ 4.500.000',
  promo: '12 cuotas sin interés',
  titular: 'Tu próxima aventura',
  lugar: 'Quilmes',
}

describe('componerPlaca (render real)', () => {
  it.each([
    ['1:1', 1080, 1080],
    ['4:5', 1080, 1350],
    ['9:16', 1080, 1920],
  ] as const)('devuelve un PNG de %s con las medidas exactas', async (aspecto, ancho, alto) => {
    const png = await componerPlaca({ escenaBytes: escenaDePrueba(), mime: MIME_ESCENA_PRUEBA, textos, plantilla: 'oferta_abajo', aspecto })
    expect(Array.from(png.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(dimensionesDe(png)).toEqual({ ancho, alto })
    expect(png.length).toBeGreaterThan(5_000)
  }, 60_000)

  it('las tres plantillas componen', async () => {
    for (const plantilla of ['oferta_abajo', 'oferta_arriba', 'catalogo'] as const) {
      const png = await componerPlaca({ escenaBytes: escenaDePrueba(), mime: MIME_ESCENA_PRUEBA, textos, plantilla, aspecto: '4:5' })
      expect(dimensionesDe(png)).toEqual({ ancho: 1080, alto: 1350 })
    }
  }, 60_000)
})
