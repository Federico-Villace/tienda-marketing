import { describe, it, expect } from 'vitest'
import { piezasDePrueba } from '../contenidista/fixture'
import { aspectoDe, promptFoto, promptImagen, VERSION_PROMPT_FOTO, VERSION_PROMPT_IMAGEN } from './prompt'
import { EDICIONES_FOTO } from './ediciones'

describe('aspectoDe (R2)', () => {
  it('S2.1 imagen en instagram es 4:5', () => expect(aspectoDe('imagen', 'instagram')).toBe('4:5'))
  it('S2.2 carrusel en facebook es 1:1', () => expect(aspectoDe('carrusel', 'facebook')).toBe('1:1'))
  it('S2.3 historia es 9:16 en cualquier plataforma', () => {
    expect(aspectoDe('historia', 'instagram')).toBe('9:16')
    expect(aspectoDe('historia', 'facebook')).toBe('9:16')
  })
  it('video y reel no son elegibles', () => {
    expect(aspectoDe('video', 'instagram')).toBeNull()
    expect(aspectoDe('reel', 'instagram')).toBeNull()
    expect(aspectoDe('cualquiera', 'instagram')).toBeNull()
  })
})

describe('promptImagen (S7.2)', () => {
  const pieza = piezasDePrueba()[1]!

  it('lleva el briefVisual, la marca, el formato y la proporción', () => {
    const p = promptImagen(pieza, '4:5')
    expect(p).toContain(pieza.briefVisual)
    expect(p).toContain(pieza.marca)
    expect(p).toContain('imagen')
    expect(p).toContain('4:5')
  })

  it('lleva las cinco reglas negativas', () => {
    const p = promptImagen(pieza, '4:5')
    expect(p).toMatch(/sin texto, letras, números ni precios/)
    expect(p).toMatch(/sin logos, emblemas ni nombres de marcas/)
    expect(p).toMatch(/sin patentes legibles/)
    expect(p).toMatch(/sin personas reconocibles/)
    expect(p).toMatch(/sin marcas de agua/)
  })

  it('no incluye el hook ni el copy', () => {
    const p = promptImagen(pieza, '4:5')
    expect(p).not.toContain(pieza.hook)
    expect(p).not.toContain(pieza.copy)
  })

  it('tiene versión de prompt', () => expect(VERSION_PROMPT_IMAGEN).toBe('productor-v1'))
})

describe('promptFoto (F3)', () => {
  it('S3.1 snapshot del prompt de una edición', () => {
    expect(promptFoto('fondo_estudio', '4:5')).toMatchInlineSnapshot(`"Editá esta foto real de una moto de un concesionario en Quilmes, Argentina, para redes sociales. Proporción 4:5. Reemplazá el fondo por un estudio fotográfico de fondo liso gris claro, con piso continuo y sombra suave bajo la moto. Reglas obligatorias: NO modifiques la moto en absoluto: forma, proporciones, color, logos y emblemas de la marca, calcos, ruedas, ópticas y todos sus detalles quedan idénticos. No agregues texto, letras, números, precios, logos nuevos ni marcas de agua. No agregues personas. Luz y sombras coherentes con la escena, aspecto fotográfico realista."`)
  })

  it('S3.1 conserva la moto, prohíbe texto y lleva la instrucción de la edición', () => {
    const p = promptFoto('escenario_ruta', '9:16')
    expect(p).toMatch(/no modifiques la moto/i)
    expect(p).toMatch(/forma, proporciones, color, logos y emblemas/)
    expect(p).toMatch(/calcos, ruedas, ópticas/)
    expect(p).toMatch(/no agregues texto, letras, números, precios, logos nuevos ni marcas de agua/i)
    expect(p).toContain('Proporción 9:16')
    expect(p).toContain(EDICIONES_FOTO.escenario_ruta.instruccion)
  })

  it('S3.2 no dice "sin logos": los logos reales de la moto se conservan', () => {
    expect(promptFoto('fondo_estudio', '1:1')).not.toMatch(/sin logos/i)
  })

  it('S3.3 el prompt no lleva la clave', () => {
    expect(promptFoto('solo_formato', '1:1')).not.toMatch(/AIza|api[-_ ]?key/i)
  })

  it('tiene versión de prompt', () => expect(VERSION_PROMPT_FOTO).toBe('productor-foto-v1'))
})
