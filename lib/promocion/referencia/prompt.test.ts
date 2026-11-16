import { describe, it, expect } from 'vitest'
import { promptLectura, VERSION_PROMPT_LECTURA, VERSION_REPARACION } from './prompt'
import { ALINEACIONES, CATEGORIAS_FUENTE, ESTILOS_PRECIO, MOTIVOS_LECTURA } from './tipos'

describe('prompt de la lectura de la referencia', () => {
  it('lleva versión (se guarda en la caché) y la de la reparación', () => {
    expect(VERSION_PROMPT_LECTURA).toBe('referencia-lectura-v1')
    expect(VERSION_REPARACION).toMatch(/^referencia-reparacion-v\d+$/)
  })

  it('no recibe ningún dato de la persona: es el mismo texto siempre', () => {
    expect(promptLectura.length).toBe(0)
    expect(promptLectura()).toBe(promptLectura())
  })

  it('pide SOLO el JSON y prohíbe transcribir textos, números y marcas', () => {
    const p = promptLectura()
    expect(p).toMatch(/solo el json/i)
    expect(p).toMatch(/nunca transcrib/i)
    expect(p).toMatch(/texto/i)
  })

  it('trata lo escrito dentro de la imagen como un dato, no como una orden', () => {
    expect(promptLectura()).toMatch(/no (es|son) (una )?(instrucci|orden)/i)
  })

  it('nombra todas las claves de la lectura y todos los valores cerrados', () => {
    const p = promptLectura()
    for (const clave of ['utilizable', 'motivo', 'fondo', 'acento', 'zonas', 'moto', 'modelo', 'precio', 'condicion', 'frase', 'cta', 'logos', 'caja']) expect(p).toContain(clave)
    for (const v of [...CATEGORIAS_FUENTE, ...ALINEACIONES, ...ESTILOS_PRECIO, ...MOTIVOS_LECTURA]) expect(p).toContain(v)
  })

  it('las cajas son relativas (0 a 1) a la imagen', () => {
    expect(promptLectura()).toMatch(/0 y 1|0 a 1/)
  })

  it('no manda ninguna clave ni dato de la persona (sin precios, sin teléfonos)', () => {
    const p = promptLectura()
    expect(p).not.toMatch(/AIza|sk-|sb_secret/)
    expect(p).not.toMatch(/\$\s?\d/)
  })

  it('cabe en los tokens que el estimado presupuesta para el prompt', () => {
    // ~4 caracteres por token; TOKENS_PROMPT_LECTURA = 1500 → 6000 caracteres como máximo.
    expect(promptLectura().length).toBeLessThan(6000)
  })
})
