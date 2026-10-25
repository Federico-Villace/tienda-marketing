import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { INSTRUCCIONES, instruccionesRespaldo, mensajeUsuario, VERSION_PROMPT } from './prompt'
import { datosDePrueba } from '../fixture'

describe('prompt de los textos de una promoción', () => {
  it('tiene una versión propia', () => {
    expect(VERSION_PROMPT).toBe('promocion-textos-v1')
  })

  it('el texto de las instrucciones está congelado: si cambia, hay que subir VERSION_PROMPT', () => {
    expect(createHash('sha256').update(INSTRUCCIONES).digest('hex')).toBe('f12d6f1ab5464f09e44598eb4b8f19c94d8b18a7946121580d077379e6ebbd23')
  })

  it('pide 3 opciones distintas y que el titular no lleve precios ni números', () => {
    expect(INSTRUCCIONES).toMatch(/3 opciones DISTINTAS/)
    expect(INSTRUCCIONES).toMatch(/SIN precios ni números/)
  })

  it('el precio y la promo del JSON son reales; no se inventan otros montos', () => {
    expect(INSTRUCCIONES).toMatch(/no inventes otros montos/)
  })

  it('prohíbe teléfonos, emails, links y direcciones, y limita WhatsApp y las menciones', () => {
    expect(INSTRUCCIONES).toMatch(/teléfonos, emails, links ni direcciones/)
    expect(INSTRUCCIONES).toMatch(/WhatsApp solo si/)
    expect(INSTRUCCIONES).toMatch(/Mencioná solo/)
  })

  it('el respaldo pega el schema', () => {
    expect(instruccionesRespaldo()).toContain(INSTRUCCIONES)
    expect(instruccionesRespaldo()).toContain('"opciones"')
  })
})

describe('mensajeUsuario', () => {
  const base = { marca: 'Benelli Store Quilmes', usuarioIg: 'benellistorequilmes', modelo: 'TRK 502', datos: datosDePrueba(), aprendizajes: null, intento: 1 }
  const json = (m: string) => JSON.parse(m.split('\n')[1]!)

  it('lleva marca, cuenta, modelo, precio formateado, promo y lugar', () => {
    const j = json(mensajeUsuario(base))
    expect(j).toMatchObject({
      marca: 'Benelli Store Quilmes',
      usuarioIg: 'benellistorequilmes',
      modelo: 'TRK 502',
      precio: '$ 4.500.000',
      promo: '12 cuotas sin interés',
      lugar: 'Quilmes',
      aprendizajes: null,
      vuelta: 1,
    })
  })
  it('las indicaciones y los aprendizajes entran si hay', () => {
    const j = json(mensajeUsuario({ ...base, aprendizajes: 'Los reels rindieron más.', intento: 3, datos: { ...datosDePrueba(), indicaciones: 'Hay stock' } }))
    expect(j).toMatchObject({ aprendizajes: 'Los reels rindieron más.', indicaciones: 'Hay stock', vuelta: 3 })
  })
  it('nunca lleva ids ni claves', () => {
    expect(mensajeUsuario(base)).not.toMatch(/uuid|sk-|sb_secret/i)
  })
})
