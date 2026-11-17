// @vitest-environment node
// Prueba de humo: dibuja la grilla de verdad con next/og (satori + resvg), las fuentes commiteadas y los logos reales.
import { describe, it, expect } from 'vitest'
import { componerPlaca } from './componer'
import { dimensionesDe } from '../productor/dimensiones'
import { escenaDePrueba, MIME_ESCENA_PRUEBA } from './escena-fixture'
import { MARCAS } from '../datos/marcas'
import { leerManifiesto } from './logos-servidor'
import { cargarRecursos } from './recursos-placa'
import { idsDeRecursosGrilla } from './varias/recursos-grilla'
import type { TextosPlaca } from './plantillas'

const textosPlaca: TextosPlaca = { marca: '', modelo: '', precio: '', promo: '', titular: '', extra: '', lugar: '' }
const MOTOS = [
  { modelo: 'ROUSER 200', precio: '$ 4.500.000', condicion: '12 cuotas sin interés' },
  { modelo: 'LEONCINO 500', precio: '$ 7.000.000', condicion: 'Contado' },
  { modelo: 'TRK 502', precio: '$ 9.200.000', condicion: '' },
  { modelo: 'GSX 150', precio: '$ 3.100.000', condicion: '' },
]

describe('componerPlaca · grilla de motos (render real)', () => {
  it.each([
    ['1:1', 1080, 1080, 2], ['1:1', 1080, 1080, 3], ['1:1', 1080, 1080, 4],
    ['4:5', 1080, 1350, 2], ['4:5', 1080, 1350, 3], ['4:5', 1080, 1350, 4],
    ['9:16', 1080, 1920, 2], ['9:16', 1080, 1920, 3], ['9:16', 1080, 1920, 4],
  ] as const)('%s con %i motos: PNG de las medidas exactas', async (formato, ancho, alto, n) => {
    const m = MARCAS[2]!
    const { recursos } = cargarRecursos(idsDeRecursosGrilla(leerManifiesto(), m.id, []))
    const png = await componerPlaca({
      escenaBytes: new Uint8Array(0),
      mime: '',
      textos: textosPlaca,
      plantilla: 'varias_motos',
      posicionMoto: 'centro',
      aspecto: '4:5',
      grilla: { formato, textos: { marca: m.nombre, titular: 'Elegí la tuya', extra: 'Hot Sale', lugar: 'Quilmes', motos: MOTOS.slice(0, n) }, fotos: MOTOS.slice(0, n).map(() => ({ bytes: escenaDePrueba(), mime: MIME_ESCENA_PRUEBA })), recursos },
    })
    expect(Array.from(png.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(dimensionesDe(png)).toEqual({ ancho, alto })
    expect(png.length).toBeGreaterThan(20_000)
  }, 60_000)
})
