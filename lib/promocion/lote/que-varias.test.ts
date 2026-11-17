import { describe, it, expect } from 'vitest'
import { leerQue, OPCIONES_QUE, QUE } from './que'

describe('?que=varias: varias motos en una sola placa', () => {
  it('se reconoce y las otras opciones siguen', () => {
    expect(leerQue('varias')).toBe('varias')
    for (const x of ['una', 'motos', 'textos']) expect(leerQue(x)).toBe(x)
    expect(QUE).toContain('varias')
  })
  it('está entre las opciones del paso 0, con su leyenda de una línea', () => {
    const o = OPCIONES_QUE.find((x) => x.id === 'varias')!
    expect(o.titulo).toBe('Varias motos en una placa')
    expect(o.leyenda).not.toContain('\n')
    expect(o.leyenda.length).toBeLessThanOrEqual(90)
  })
  it('hay una opción por cada valor de QUE', () => {
    expect(OPCIONES_QUE.map((o) => o.id).sort()).toEqual([...QUE].sort())
  })
})
