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

describe('componerPlaca (render real) · editorial', () => {
  it.each(FORMATOS)('%s: PNG de las medidas exactas (incluye la máscara de la escena)', async (formato, ancho, alto) => {
    const png = await componerDeDiseno('editorial', 2, formato, { diseno: { lista: ['ABS', 'Bluetooth', 'Cardán'] } })
    expect(dimensionesDe(png)).toEqual({ ancho, alto })
    expect(png.length).toBeGreaterThan(20_000)
  }, 60_000)

  it('compone con cada concesionaria real (logo claro sobre crema incluido) y con número propio', async () => {
    for (const marca of [0, 1, 3, 5, 6]) expect(dimensionesDe(await componerDeDiseno('editorial', marca, '4:5')), MARCAS[marca]!.nombre).toEqual({ ancho: 1080, alto: 1350 })
    expect(dimensionesDe(await componerDeDiseno('editorial', 2, '9:16', { diseno: { numero: '2026', acento: 'azul', mostrarPrecio: false } }))).toEqual({ ancho: 1080, alto: 1920 })
  }, 120_000)
})

describe('componerPlaca (render real) · ocultos: sacar textos', () => {
  const TODO = ['modelo', 'frase', 'precio', 'condicion', 'cta', 'lugar', 'logo999', 'logoConcesionaria'] as const
  it.each(['impactante_textura', 'deportiva', 'editorial'] as const)('%s: con algunos textos sacados y con TODOS sacados compone el PNG de las medidas exactas', async (pl) => {
    for (const [formato, ancho, alto] of FORMATOS) {
      expect(dimensionesDe(await componerDeDiseno(pl, 2, formato, { diseno: { ocultos: ['precio', 'lugar', 'logo999'] } })), `${pl} ${formato} parcial`).toEqual({ ancho, alto })
      expect(dimensionesDe(await componerDeDiseno(pl, 2, formato, { diseno: { ocultos: [...TODO] } })), `${pl} ${formato} todo`).toEqual({ ancho, alto })
    }
  }, 120_000)
  it('las placas clásicas también componen sin texto', async () => {
    const vacios = { marca: '', modelo: '', precio: '', promo: '', titular: '', extra: '', lugar: '' }
    const png = await componerPlaca({ escenaBytes: escenaDePrueba(), mime: MIME_ESCENA_PRUEBA, textos: vacios, plantilla: 'oferta_abajo', posicionMoto: 'centro', aspecto: '4:5' })
    expect(dimensionesDe(png)).toEqual({ ancho: 1080, alto: 1350 })
  }, 60_000)
})

// ── Plantilla 'referencia' (ADR-039): el layout, los colores y las letras salen de una lectura ────────
import { plantillaDePrueba } from './referencia/fixture'
import { tonoDeReferencia } from './referencia/acento'

describe('componerPlaca (render real) · referencia', () => {
  async function componerReferencia(formato: '1:1' | '4:5' | '9:16', o: { diseno?: Diseno | null; aspectoRef?: '4:5' | '1:1' | '9:16' } = {}) {
    const m = MARCAS[2]!
    const ref = plantillaDePrueba(o.aspectoRef ?? '4:5')!
    const { recursos } = cargarRecursos(idsDeRecursosDe(leerManifiesto(), m.id, 'referencia', null, tonoDeReferencia(ref)))
    return componerPlaca({
      escenaBytes: escenaDePrueba(),
      mime: MIME_ESCENA_PRUEBA,
      textos: { ...textos, marca: m.nombre },
      plantilla: 'referencia',
      posicionMoto: 'centro',
      aspecto: '4:5',
      formato,
      diseno: o.diseno ?? null,
      datos: datosDePrueba(),
      recursos,
      nombreConcesionaria: m.nombre,
      referencia: ref,
    })
  }

  it.each(FORMATOS)('%s: PNG de las medidas exactas (degradé, escena fundida y pie incluidos)', async (formato, ancho, alto) => {
    const png = await componerReferencia(formato)
    expect(Array.from(png.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(dimensionesDe(png)).toEqual({ ancho, alto })
    expect(png.length).toBeGreaterThan(20_000)
  }, 60_000)

  it('con la variación espejada, otro acento y el precio oculto también compone', async () => {
    const png = await componerReferencia('4:5', { diseno: { variacion: 1, acento: 'rojo', mostrarPrecio: false } })
    expect(dimensionesDe(png)).toEqual({ ancho: 1080, alto: 1350 })
  }, 60_000)

  it('una referencia vertical (9:16) se adapta a un formato cuadrado', async () => {
    const png = await componerReferencia('1:1', { aspectoRef: '9:16' })
    expect(dimensionesDe(png)).toEqual({ ancho: 1080, alto: 1080 })
  }, 60_000)

  it('sin la lectura no dibuja: lanza antes de gastar el render', async () => {
    const m = MARCAS[2]!
    const { recursos } = cargarRecursos(idsDeRecursosDe(leerManifiesto(), m.id, 'referencia', null))
    await expect(
      componerPlaca({ escenaBytes: escenaDePrueba(), mime: MIME_ESCENA_PRUEBA, textos, plantilla: 'referencia', posicionMoto: 'centro', aspecto: '4:5', formato: '4:5', diseno: null, datos: datosDePrueba(), recursos, nombreConcesionaria: m.nombre }),
    ).rejects.toThrow(/lectura de la referencia/i)
  })
})
