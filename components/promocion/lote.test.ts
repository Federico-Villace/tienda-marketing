import { describe, it, expect } from 'vitest'
import { enLotes } from './lote'

describe('enLotes', () => {
  it('corre todo y devuelve los resultados en el orden de entrada', async () => {
    const r = await enLotes([1, 2, 3, 4, 5], 3, async (x) => x * 2)
    expect(r).toEqual([2, 4, 6, 8, 10])
  })
  it('nunca corre más del límite a la vez', async () => {
    let activos = 0
    let max = 0
    await enLotes([1, 2, 3, 4, 5, 6, 7], 3, async () => {
      activos++
      max = Math.max(max, activos)
      await new Promise((r) => setTimeout(r, 5))
      activos--
    })
    expect(max).toBe(3)
  })
  it('un error en uno no frena a los otros: queda en su lugar', async () => {
    const r = await enLotes([1, 2, 3], 2, async (x) => {
      if (x === 2) throw new Error('falló')
      return x
    })
    expect(r[0]).toBe(1)
    expect(r[1]).toBeInstanceOf(Error)
    expect(r[2]).toBe(3)
  })
  it('lista vacía: nada', async () => {
    expect(await enLotes([], 3, async (x) => x)).toEqual([])
  })
})
