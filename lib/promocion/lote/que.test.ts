import { describe, it, expect } from 'vitest'
import { leerQue, OPCIONES_QUE } from './que'

describe('leerQue (?que= de /promocionar/nueva)', () => {
  it('acepta una, motos y textos', () => {
    expect(leerQue('una')).toBe('una')
    expect(leerQue('motos')).toBe('motos')
    expect(leerQue('textos')).toBe('textos')
  })
  it('lo demás (ausente, vacío, raro, repetido) vuelve a la primera pregunta', () => {
    for (const x of [undefined, '', 'grilla', 'MOTOS', ' motos', ['motos', 'una']]) expect(leerQue(x as never)).toBeNull()
  })
  it('las opciones tienen una leyenda de una línea y apuntan a su ?que=', () => {
    expect(OPCIONES_QUE.map((o) => o.id)).toEqual(['una', 'motos', 'textos'])
    for (const o of OPCIONES_QUE) {
      expect(o.leyenda).not.toContain('\n')
      expect(o.leyenda.length).toBeLessThanOrEqual(90)
    }
  })
})
