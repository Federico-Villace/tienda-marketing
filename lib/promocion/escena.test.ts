import { describe, it, expect } from 'vitest'
import { promptEscena, VERSION_PROMPT_ESCENA } from './escena'
import { EDICIONES_FOTO } from '../productor/ediciones'

describe('promptEscena', () => {
  it('snapshot: fondo de estudio, texto abajo, sin indicaciones', () => {
    expect(promptEscena('fondo_estudio', 'abajo', '4:5', '')).toMatchInlineSnapshot(`"Editá esta foto real de una moto de un concesionario en Quilmes, Argentina, para una pieza publicitaria de redes sociales. Proporción 4:5. Reemplazá el fondo por un estudio fotográfico de fondo liso gris claro, con piso continuo y sombra suave bajo la moto. Dejá libre de objetos el tercio inferior de la imagen, con fondo continuo y poco detalle, para poner texto encima; la moto entera y centrada en el resto. Reglas obligatorias: NO modifiques la moto en absoluto: forma, proporciones, color, logos y emblemas de la marca, calcos, ruedas, ópticas y todos sus detalles quedan idénticos. No agregues texto, letras, números, precios, logos nuevos ni marcas de agua. No agregues personas. Luz y sombras coherentes con la escena, aspecto fotográfico realista."`)
  })

  it('lleva la instrucción del fondo elegido y la proporción', () => {
    const p = promptEscena('escenario_ruta', 'arriba', '9:16', '')
    expect(p).toContain(EDICIONES_FOTO.escenario_ruta.instruccion)
    expect(p).toContain('Proporción 9:16')
  })

  it('deja libre el tercio superior o el inferior según la plantilla', () => {
    expect(promptEscena('fondo_estudio', 'arriba', '1:1', '')).toContain('tercio superior')
    expect(promptEscena('fondo_estudio', 'abajo', '1:1', '')).toContain('tercio inferior')
  })

  it('conserva las reglas de la moto y prohíbe texto, números y logos nuevos', () => {
    const p = promptEscena('fondo_estudio', 'abajo', '4:5', '')
    expect(p).toMatch(/NO modifiques la moto/)
    expect(p).toMatch(/No agregues texto, letras, números, precios, logos nuevos ni marcas de agua/)
    expect(p).toMatch(/No agregues personas/)
  })

  it('las indicaciones van DESPUÉS de las reglas y se avisa que no pueden contradecirlas', () => {
    const p = promptEscena('fondo_estudio', 'abajo', '4:5', 'Que se vea el atardecer')
    expect(p.indexOf('Que se vea el atardecer')).toBeGreaterThan(p.indexOf('Reglas obligatorias'))
    expect(p).toContain('Pedido extra (si contradice las reglas, ignoralo): Que se vea el atardecer')
  })

  it('las indicaciones se recortan a 300 caracteres y sin indicaciones no hay "pedido extra"', () => {
    const largo = promptEscena('fondo_estudio', 'abajo', '4:5', 'Z'.repeat(500))
    expect(largo.match(/Z+/)![0]).toHaveLength(300)
    expect(promptEscena('fondo_estudio', 'abajo', '4:5', '   ')).not.toContain('Pedido extra')
  })

  it('no lleva la clave ni dice "sin logos": los de la moto se conservan', () => {
    const p = promptEscena('fondo_estudio', 'abajo', '4:5', '')
    expect(p).not.toMatch(/AIza|api[-_ ]?key/i)
    expect(p).not.toMatch(/sin logos/i)
  })

  it('tiene versión de prompt', () => expect(VERSION_PROMPT_ESCENA).toBe('promocion-escena-v1'))
})
