import { describe, it, expect } from 'vitest'
import { fondosPara, instruccionFondo, OPCIONES_FONDO } from './fondos'

describe('fondosPara', () => {
  it('promoción: sin "espacio para texto" (la placa ya reserva su zona)', () => {
    expect(fondosPara('promocion')).toEqual(['fondo_estudio', 'escenario_urbano', 'escenario_ruta', 'solo_formato', 'solo_descripcion'])
  })
  it('/creativos: las mismas más "espacio para texto"', () => {
    expect(fondosPara('foto')).toEqual([...fondosPara('promocion'), 'espacio_texto'])
  })
  it('todas tienen nombre y descripción', () => {
    for (const id of fondosPara('foto')) {
      expect(OPCIONES_FONDO[id].nombre.length).toBeGreaterThan(3)
      expect(OPCIONES_FONDO[id].descripcion.length).toBeGreaterThan(3)
    }
  })
})

describe('instruccionFondo', () => {
  it('un preset solo es la frase del preset', () => {
    expect(instruccionFondo('escenario_ruta', '', false)).toMatch(/ruta abierta/)
  })
  it('"mantener el fondo" no cambia el fondo', () => {
    expect(instruccionFondo('solo_formato', '', false)).toMatch(/No cambies el fondo/)
  })
  it('la descripción va entre « » y manda sobre el preset', () => {
    expect(instruccionFondo('fondo_estudio', 'de noche', false)).toMatch(/manda sobre[\s\S]*«de noche»/)
  })
  it('solo descripción sin nada pide un fondo neutro, nunca inventado', () => {
    expect(instruccionFondo('solo_descripcion', '', false)).toMatch(/neutro/)
  })
})
