import { describe, it, expect } from 'vitest'
import { piezasDePrueba } from '../contenidista/fixture'
import { aspectoDe, promptImagen, VERSION_PROMPT_IMAGEN } from './prompt'

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
