import { describe, it, expect } from 'vitest'
import { Ctx, EMAIL, TELEFONO, esObj } from './validar'

describe('esObj', () => {
  it('acepta objetos y rechaza null, arrays y primitivos', () => {
    expect(esObj({})).toBe(true)
    expect(esObj(null)).toBe(false)
    expect(esObj([])).toBe(false)
    expect(esObj('x')).toBe(false)
  })
})

describe('EMAIL y TELEFONO', () => {
  it('detectan un email y un teléfono, pero no "25 a 40 años"', () => {
    expect(EMAIL.test('escribinos a hola@999motos.com')).toBe(true)
    expect(TELEFONO.test('llamá al 11 5555-1234')).toBe(true)
    expect(TELEFONO.test('de 25 a 40 años')).toBe(false)
  })
})

describe('Ctx', () => {
  it('objeto exige exactamente las claves y nombra la ruta', () => {
    const c = new Ctx()
    expect(c.objeto({ a: 1, z: 2 }, 'plan', ['a', 'b'])).toBeNull()
    expect(c.errores).toEqual(['Falta el campo "b".', 'El campo "z" no está permitido.'])
  })

  it('la ruta raíz es configurable', () => {
    const c = new Ctx('pieza')
    c.objeto({}, 'pieza', ['hook'])
    c.objeto({}, 'pieza.sub', ['x'])
    expect(c.errores).toEqual(['Falta el campo "hook".', 'Falta el campo "pieza.sub.x".'])
  })

  it('texto recorta y valida el largo', () => {
    const c = new Ctx()
    expect(c.texto('  hola ', 'a', 1, 10)).toBe('hola')
    c.texto('', 'b', 1, 10)
    expect(c.errores).toHaveLength(1)
  })

  it('textoONull usa max 500 por defecto y acepta otro', () => {
    const c = new Ctx()
    expect(c.textoONull(null, 'a')).toBeNull()
    c.textoONull('x'.repeat(501), 'b')
    expect(c.errores).toHaveLength(1)
    expect(c.textoONull('x'.repeat(600), 'c', 1000)).toHaveLength(600)
    expect(c.errores).toHaveLength(1)
  })

  it('lista y entero validan rangos', () => {
    const c = new Ctx()
    expect(c.lista([1], 'l', 1, 2)).toEqual([1])
    expect(c.lista([], 'l', 1, 2)).toEqual([])
    expect(c.entero(5, 'n', 1, 3)).toBe(1)
    expect(c.errores).toHaveLength(2)
  })
})
