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
  extra: 'Hot Sale · Solo este fin de semana',
  lugar: 'Quilmes',
}

describe('componerPlaca (render real)', () => {
  it.each([
    ['1:1', 1080, 1080],
    ['4:5', 1080, 1350],
    ['9:16', 1080, 1920],
  ] as const)('devuelve un PNG de %s con las medidas exactas', async (aspecto, ancho, alto) => {
    const png = await componerPlaca({ escenaBytes: escenaDePrueba(), mime: MIME_ESCENA_PRUEBA, textos, plantilla: 'oferta_abajo', posicionMoto: 'centro', aspecto })
    expect(Array.from(png.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(dimensionesDe(png)).toEqual({ ancho, alto })
    expect(png.length).toBeGreaterThan(5_000)
  }, 60_000)

  it('las seis plantillas componen (al costado, con la moto de un lado)', async () => {
    for (const plantilla of ['oferta_abajo', 'oferta_arriba', 'oferta_costado', 'catalogo', 'catalogo_arriba', 'catalogo_costado'] as const) {
      const png = await componerPlaca({ escenaBytes: escenaDePrueba(), mime: MIME_ESCENA_PRUEBA, textos, plantilla, posicionMoto: 'izquierda', aspecto: '4:5' })
      expect(dimensionesDe(png)).toEqual({ ancho: 1080, alto: 1350 })
    }
  }, 60_000)
})

// ── Plantillas de diseño con los logos y texturas REALES ─────────────────────────────────────────
import { MARCAS } from '../datos/marcas'
import { datosDePrueba } from './fixture'
import { idsDeRecursosDe } from './diseno/recursos-ids'
import { leerManifiesto } from './logos-servidor'
import { cargarRecursos } from './recursos-placa'
import type { Diseno } from './diseno/tipos'
import type { IdPlantillaDiseno } from './tipos'

const FORMATOS = [
  ['1:1', 1080, 1080],
  ['4:5', 1080, 1350],
  ['9:16', 1080, 1920],
] as const

export async function componerDeDiseno(plantilla: IdPlantillaDiseno, marca: number, formato: '1:1' | '4:5' | '9:16', o: { diseno?: Diseno | null; logoMarca?: string | null } = {}) {
  const m = MARCAS[marca]!
  const { recursos } = cargarRecursos(idsDeRecursosDe(leerManifiesto(), m.id, plantilla, o.logoMarca ?? null))
  return componerPlaca({
    escenaBytes: escenaDePrueba(),
    mime: MIME_ESCENA_PRUEBA,
    textos: { ...textos, marca: m.nombre },
    plantilla,
    posicionMoto: 'centro',
    aspecto: '4:5',
    formato,
    diseno: o.diseno ?? null,
    datos: datosDePrueba(),
    recursos,
    nombreConcesionaria: m.nombre,
  })
}

describe('componerPlaca (render real) · impactante_textura', () => {
  // 0 = 999motos, 1 = Motoplex (PNG blanco + logos JPG de marca), 2 = Suzuki, 3 = Benelli (WebP), 4 = QJ (sin logo), 5 = Zontes (sin logo), 6 = Morini (195 px)
  it.each(FORMATOS)('%s: PNG de las medidas exactas con el logo de 999 y la concesionaria', async (formato, ancho, alto) => {
    const png = await componerDeDiseno('impactante_textura', 2, formato)
    expect(Array.from(png.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(dimensionesDe(png)).toEqual({ ancho, alto })
    expect(png.length).toBeGreaterThan(20_000)
  }, 60_000)

  it('compone con cada concesionaria real: PNG, JPG, WebP, baja resolución y logo faltante', async () => {
    for (const marca of [0, 1, 2, 3, 4, 5, 6]) {
      const png = await componerDeDiseno('impactante_textura', marca, '4:5')
      expect(dimensionesDe(png), MARCAS[marca]!.nombre).toEqual({ ancho: 1080, alto: 1350 })
    }
  }, 120_000)

  it('con un logo de marca en JPG (Vespa en Motoplex) y un acento distinto', async () => {
    const png = await componerDeDiseno('impactante_textura', 1, '9:16', { logoMarca: 'vespa', diseno: { acento: 'rojo' } })
    expect(dimensionesDe(png)).toEqual({ ancho: 1080, alto: 1920 })
  }, 60_000)

  it('mostrarPrecio=false y una condición vacía también componen', async () => {
    const png = await componerDeDiseno('impactante_textura', 2, '1:1', { diseno: { mostrarPrecio: false, condicion: { texto: '', destacado: '' } } })
    expect(dimensionesDe(png)).toEqual({ ancho: 1080, alto: 1080 })
  }, 60_000)
})

describe('componerPlaca (render real) · deportiva', () => {
  it.each(FORMATOS)('%s: PNG de las medidas exactas (contorno, skew y diagonales incluidos)', async (formato, ancho, alto) => {
    const png = await componerDeDiseno('deportiva', 2, formato)
    expect(dimensionesDe(png)).toEqual({ ancho, alto })
    expect(png.length).toBeGreaterThan(20_000)
  }, 60_000)

  it('compone con cada concesionaria real y con acentos y precio oculto', async () => {
    for (const marca of [0, 1, 3, 5, 6]) expect(dimensionesDe(await componerDeDiseno('deportiva', marca, '4:5')), MARCAS[marca]!.nombre).toEqual({ ancho: 1080, alto: 1350 })
    expect(dimensionesDe(await componerDeDiseno('deportiva', 2, '1:1', { diseno: { acento: 'verde', mostrarPrecio: false } }))).toEqual({ ancho: 1080, alto: 1080 })
  }, 120_000)
})
