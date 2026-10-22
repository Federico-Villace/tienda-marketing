import { describe, it, expect } from 'vitest'
import { ASPECTOS_FOTO, EDICIONES_FOTO, esAspectoFoto, esEdicion, menuConPrecios } from './ediciones'
import { estimarImagenes } from './precios'

describe('menú de ediciones de foto (F2)', () => {
  it('tiene las cinco ediciones con nombre, descripción e instrucción', () => {
    expect(Object.keys(EDICIONES_FOTO)).toEqual([
      'fondo_estudio',
      'escenario_urbano',
      'escenario_ruta',
      'espacio_texto',
      'solo_formato',
    ])
    for (const e of Object.values(EDICIONES_FOTO)) {
      expect(e.nombre.length).toBeGreaterThan(0)
      expect(e.descripcion.length).toBeGreaterThan(0)
      expect(e.instruccion.length).toBeGreaterThan(0)
    }
  })

  it('los aspectos son 1:1, 4:5 y 9:16 con su etiqueta', () => {
    expect(ASPECTOS_FOTO).toEqual({ '1:1': 'Feed cuadrado', '4:5': 'Feed vertical', '9:16': 'Historia' })
    expect(esAspectoFoto('4:5')).toBe(true)
    expect(esAspectoFoto('16:9')).toBe(false)
    expect(esAspectoFoto(5)).toBe(false)
  })

  it('S2.2 esEdicion rechaza ids desconocidas (también las del prototipo)', () => {
    expect(esEdicion('fondo_estudio')).toBe(true)
    expect(esEdicion('inventada')).toBe(false)
    expect(esEdicion('toString')).toBe(false)
    expect(esEdicion(undefined)).toBe(false)
  })

  it('S2.1 menuConPrecios: cinco ítems con el precio de estimarImagenes conFoto', () => {
    const menu = menuConPrecios('gemini-nano-banana-2.1', 2)
    expect(menu).toHaveLength(5)
    const e = estimarImagenes('gemini-nano-banana-2.1', 2, { conFoto: true })
    for (const item of menu) {
      expect(item.porImagenUsd).toBe(e.topePorImagenUsd)
      expect(item.topeTotalUsd).toBe(e.topeTotalUsd)
      expect(esEdicion(item.edicion)).toBe(true)
    }
  })

  it('un motor sin precio tira error', () => {
    expect(() => menuConPrecios('x', 1)).toThrow(/sin precio/i)
  })
})
