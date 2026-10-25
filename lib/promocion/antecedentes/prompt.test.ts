import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { INSTRUCCIONES, mensajeUsuario, VERSION_PROMPT } from './prompt'

describe('prompt de los antecedentes de una promoción', () => {
  it('tiene una versión propia', () => {
    expect(VERSION_PROMPT).toBe('promocion-antecedentes-v2')
  })

  it('el texto de las instrucciones está congelado: si cambia, hay que subir VERSION_PROMPT', () => {
    const sha = createHash('sha256').update(INSTRUCCIONES).digest('hex')
    expect(sha).toBe('4c0f3c5fa84f5b0b10ad12b9cf479b325bb91d1d9f6ad739b1b2a5cf07a120f6')
  })

  it('exige usar solo cifras del JSON y aclarar las muestras chicas', () => {
    expect(INSTRUCCIONES).toMatch(/SOLO cifras/)
    expect(INSTRUCCIONES).toMatch(/menos de 5/)
  })

  it('las campañas solo cuentan si mencionan la marca o el modelo en el nombre', () => {
    expect(INSTRUCCIONES).toMatch(/nombre/)
    expect(INSTRUCCIONES).toMatch(/no las atribuyas/i)
  })

  it('si no hay publicaciones del modelo lo dice, y pide 3 recomendaciones para ESTA pieza', () => {
    expect(INSTRUCCIONES).toMatch(/no hay publicaciones que lo mencionen/)
    expect(INSTRUCCIONES).toMatch(/3 recomendaciones/)
    expect(INSTRUCCIONES).toMatch(/250 palabras/)
  })

  it('explica cómo usar la comparación entre marcas', () => {
    expect(INSTRUCCIONES).toMatch(/"comparacion"/)
    expect(INSTRUCCIONES).toMatch(/OTRAS marcas/)
  })

  it('el mensaje de usuario lleva el JSON de agregados', () => {
    expect(mensajeUsuario({ hola: 'mundo' } as never)).toBe('Datos para la promoción (JSON):\n{"hola":"mundo"}')
  })
})
