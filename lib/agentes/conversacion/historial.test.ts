import { describe, it, expect } from 'vitest'
import { pedidosAnteriores, type TurnoPrevio } from './historial.ts'

const t = (turno: number, pedido: string, estado: TurnoPrevio['estado'] = 'ok'): TurnoPrevio => ({ turno, pedido, estado })

describe('pedidosAnteriores', () => {
  it('solo los turnos ok, en orden', () => {
    expect(pedidosAnteriores([t(3, 'c'), t(1, 'a'), t(2, 'b', 'error'), t(4, 'd', 'pendiente')])).toEqual(['a', 'c'])
  })
  it('máximo 4: los más recientes', () => {
    const turnos = ['a', 'b', 'c', 'd', 'e', 'f'].map((p, i) => t(i + 1, p))
    expect(pedidosAnteriores(turnos)).toEqual(['c', 'd', 'e', 'f'])
  })
  it('sin turnos, vacío', () => expect(pedidosAnteriores([])).toEqual([]))
})
