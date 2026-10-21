import { describe, it, expect } from 'vitest'
import { excedeTope, piezasPedidas, rangoSemana } from './semana'
import { planDePrueba } from './fixture'

const plan = planDePrueba()

describe('rangoSemana', () => {
  it('la semana 1 arranca en ventana.desde y dura 7 días', () => {
    expect(rangoSemana(plan, 1)).toEqual({ desde: '2026-11-02', hasta: '2026-11-08' })
    expect(rangoSemana(plan, 2)).toEqual({ desde: '2026-11-09', hasta: '2026-11-15' })
  })
  it('el fin se recorta a la ventana del plan', () => {
    const p = { ...plan, ventana: { desde: '2026-11-02', hasta: '2026-11-10' } }
    expect(rangoSemana(p, 2)).toEqual({ desde: '2026-11-09', hasta: '2026-11-10' })
  })
  it('una semana que empieza después de la ventana, o inexistente, no tiene rango', () => {
    const p = { ...plan, ventana: { desde: '2026-11-02', hasta: '2026-11-05' } }
    expect(rangoSemana(p, 2)).toBeNull()
    expect(rangoSemana(plan, 99)).toBeNull()
  })
})

describe('piezasPedidas / excedeTope', () => {
  it('suma las cantidades de la semana', () => {
    expect(piezasPedidas(plan, 1)).toBe(4)
    expect(piezasPedidas(plan, 2)).toBe(3)
    expect(piezasPedidas(plan, 99)).toBe(0)
  })
  it('el tope es 12 y 12 entra', () => {
    const p = planDePrueba()
    p.calendario[0]!.piezas[0]!.cantidad = 9
    expect(piezasPedidas(p, 1)).toBe(12)
    expect(excedeTope(p, 1)).toBe(false)
    p.calendario[0]!.piezas[0]!.cantidad = 10
    expect(excedeTope(p, 1)).toBe(true)
  })
})
