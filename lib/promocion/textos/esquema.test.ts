import { describe, it, expect } from 'vitest'
import { ESQUEMA_TEXTOS, FORMATO_TEXTOS } from './esquema'

describe('esquema de los textos de una promoción', () => {
  it('es strict: todo objeto sin propiedades de más y con TODOS los campos en required', () => {
    const visitar = (n: any): void => {
      if (n?.type === 'object') {
        expect(n.additionalProperties).toBe(false)
        expect(n.required).toEqual(Object.keys(n.properties))
        Object.values(n.properties).forEach(visitar)
      }
      if (n?.type === 'array') visitar(n.items)
    }
    visitar(ESQUEMA_TEXTOS)
  })
  it('pide la lista de opciones con los seis campos de cada una', () => {
    const op = (ESQUEMA_TEXTOS.properties as any).opciones.items
    expect(Object.keys(op.properties)).toEqual(['titular', 'hook', 'copy', 'hashtags', 'cta', 'altText'])
  })
  it('no usa minItems/maxItems/pattern: strict no los admite (los controla validarOpciones)', () => {
    expect(JSON.stringify(ESQUEMA_TEXTOS)).not.toMatch(/minItems|maxItems|pattern|minLength|maxLength/)
  })
  it('se pide como json_schema strict', () => {
    expect(FORMATO_TEXTOS).toMatchObject({ type: 'json_schema', name: 'textos_promocion', strict: true })
  })
})
