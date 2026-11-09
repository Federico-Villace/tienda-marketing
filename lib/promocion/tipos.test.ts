import { describe, it, expect } from 'vitest'
import {
  combinacionValida,
  esPosicionMoto,
  estiloDe,
  IDS_PLANTILLA,
  MENSAJE_COSTADO_SIN_LADO,
  plantillaDe,
  posicionTextoDe,
  POSICIONES_MOTO,
  POSICIONES_TEXTO,
  zonaDe,
} from './tipos'

describe('plantilla = estilo × posición del texto', () => {
  it('son seis y las tres de siempre siguen siendo válidas', () => {
    expect(IDS_PLANTILLA).toEqual(['oferta_abajo', 'oferta_arriba', 'oferta_costado', 'catalogo', 'catalogo_arriba', 'catalogo_costado'])
    expect(IDS_PLANTILLA).toEqual(expect.arrayContaining(['oferta_abajo', 'oferta_arriba', 'catalogo']))
  })

  it('cada id se descompone en estilo y posición, y se vuelve a armar igual', () => {
    for (const id of IDS_PLANTILLA) expect(plantillaDe(estiloDe(id), posicionTextoDe(id))).toBe(id)
    expect(estiloDe('oferta_arriba')).toBe('degradado')
    expect(estiloDe('catalogo')).toBe('solido')
    expect(posicionTextoDe('catalogo')).toBe('abajo')
    expect(posicionTextoDe('oferta_costado')).toBe('costado')
  })

  it('cubre las 2 × 3 combinaciones', () => {
    const combinaciones = new Set(IDS_PLANTILLA.map((id) => `${estiloDe(id)}/${posicionTextoDe(id)}`))
    expect(combinaciones.size).toBe(6)
    expect(POSICIONES_TEXTO).toEqual(['arriba', 'abajo', 'costado'])
  })
})

describe('posición de la moto', () => {
  it('son tres', () => {
    expect(POSICIONES_MOTO).toEqual(['izquierda', 'centro', 'derecha'])
    expect(esPosicionMoto('centro')).toBe(true)
    expect(esPosicionMoto('arriba')).toBe(false)
    expect(esPosicionMoto(null)).toBe(false)
  })
})

describe('zonaDe: dónde queda libre la imagen para el texto', () => {
  it('arriba y abajo no dependen de la moto', () => {
    for (const m of POSICIONES_MOTO) {
      expect(zonaDe('oferta_arriba', m)).toBe('arriba')
      expect(zonaDe('catalogo', m)).toBe('abajo')
    }
  })
  it('al costado, el texto va del lado opuesto a la moto', () => {
    expect(zonaDe('oferta_costado', 'izquierda')).toBe('derecha')
    expect(zonaDe('catalogo_costado', 'derecha')).toBe('izquierda')
  })
})

describe('combinacionValida', () => {
  it('al costado la moto no puede ir al centro', () => {
    expect(combinacionValida('oferta_costado', 'centro')).toBe(false)
    expect(combinacionValida('oferta_costado', 'derecha')).toBe(true)
    expect(combinacionValida('oferta_abajo', 'centro')).toBe(true)
    expect(combinacionValida(null, 'centro')).toBe(true)
    expect(MENSAJE_COSTADO_SIN_LADO).toMatch(/izquierda o a la derecha/)
  })
})

describe('fondos de una promoción', () => {
  it('acepta "mantener el fondo de la foto" y sigue sin aceptar "espacio para texto" (la placa ya reserva su zona)', async () => {
    const { esFondo } = await import('./tipos')
    expect(esFondo('solo_formato')).toBe(true)
    expect(esFondo('espacio_texto')).toBe(false)
  })
})

describe('plantillas de diseño (impactante, deportiva, editorial)', () => {
  it('esPlantilla acepta las 6 clásicas + las 3 de diseño; esPlantillaDiseno las distingue', async () => {
    const { esPlantilla, esPlantillaDiseno, IDS_PLANTILLA_DISENO } = await import('./tipos')
    expect(IDS_PLANTILLA_DISENO).toEqual(['impactante_textura', 'deportiva', 'editorial'])
    for (const id of IDS_PLANTILLA_DISENO) {
      expect(esPlantilla(id)).toBe(true)
      expect(esPlantillaDiseno(id)).toBe(true)
    }
    for (const id of IDS_PLANTILLA) {
      expect(esPlantilla(id)).toBe(true)
      expect(esPlantillaDiseno(id)).toBe(false)
    }
    expect(esPlantilla('otra')).toBe(false)
    expect(esPlantillaDiseno(null)).toBe(false)
  })

  it('la zona es "marco" sea cual sea la moto', async () => {
    const { zonaDe: zona } = await import('./tipos')
    for (const m of POSICIONES_MOTO) expect(zona('impactante_textura', m)).toBe('marco')
    expect(zona('editorial', 'centro')).toBe('marco')
  })

  it('posicionDeClave: marco para diseño, la de siempre para las clásicas', async () => {
    const { posicionDeClave } = await import('./tipos')
    expect(posicionDeClave('deportiva')).toBe('marco')
    expect(posicionDeClave('oferta_costado')).toBe('costado')
    expect(posicionDeClave('catalogo')).toBe('abajo')
  })

  it('el diseño exige la moto al centro; las clásicas no cambian', async () => {
    const { combinacionValida: valida } = await import('./tipos')
    expect(valida('impactante_textura', 'izquierda')).toBe(false)
    expect(valida('editorial', 'derecha')).toBe(false)
    expect(valida('deportiva', 'centro')).toBe(true)
    expect(valida('oferta_abajo', 'izquierda')).toBe(true)
  })
})
