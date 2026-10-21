import { describe, it, expect } from 'vitest'
import { validarPedido } from './pedido'

const ID = '11111111-1111-4111-8111-111111111111'

describe('validarPedido', () => {
  it('acepta plan_id, semana y notas opcionales', () => {
    expect(validarPedido({ plan_id: ID, semana: 2, notas: 'Foco en financiación' })).toEqual({
      ok: true,
      pedido: { planId: ID, semana: 2, notas: 'Foco en financiación' },
    })
    expect(validarPedido({ plan_id: ID, semana: 1 })).toMatchObject({ ok: true, pedido: { notas: null } })
  })

  it('las notas vacías o en blanco son null y se recortan', () => {
    expect(validarPedido({ plan_id: ID, semana: 1, notas: '   ' })).toMatchObject({ pedido: { notas: null } })
    expect(validarPedido({ plan_id: ID, semana: 1, notas: ' hola ' })).toMatchObject({ pedido: { notas: 'hola' } })
  })

  it('S10: 1000 caracteres entran, 1001 dan 422', () => {
    expect(validarPedido({ plan_id: ID, semana: 1, notas: 'a'.repeat(1000) }).ok).toBe(true)
    expect(validarPedido({ plan_id: ID, semana: 1, notas: 'a'.repeat(1001) })).toMatchObject({ ok: false, status: 422 })
  })

  it('forma inválida da 400: sin objeto, id no UUID, semana no entera o claves de más (R2.2)', () => {
    for (const x of [null, [], 'x', { semana: 1 }, { plan_id: 'abc', semana: 1 }, { plan_id: ID, semana: 1.5 }, { plan_id: ID, semana: '1' }, { plan_id: ID, semana: 0 }]) {
      expect(validarPedido(x)).toMatchObject({ ok: false, status: 400 })
    }
    for (const extra of ['filas', 'analisis', 'apiKey', 'organizacion_id']) {
      expect(validarPedido({ plan_id: ID, semana: 1, [extra]: 'x' })).toMatchObject({ ok: false, status: 400 })
    }
  })

  it('notas que no son texto dan 400', () => {
    expect(validarPedido({ plan_id: ID, semana: 1, notas: 5 })).toMatchObject({ ok: false, status: 400 })
  })
})
