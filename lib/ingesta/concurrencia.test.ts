import { describe, it, expect } from 'vitest'
import { enParalelo } from './concurrencia'

const pausa = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

describe('enParalelo', () => {
  it('devuelve los resultados en el orden de entrada, no en el de llegada', async () => {
    const r = await enParalelo([30, 1, 15], 3, async (ms) => {
      await pausa(ms)
      return ms
    })
    expect(r).toEqual([30, 1, 15])
  })

  it('nunca tiene más de `limite` tareas en vuelo, y llega a usarlas todas', async () => {
    let enVuelo = 0
    let pico = 0
    await enParalelo(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      pico = Math.max(pico, ++enVuelo)
      await pausa(2)
      enVuelo--
    })
    expect(pico).toBe(3)
  })

  it('con límite 1 es en serie', async () => {
    const orden: string[] = []
    await enParalelo(['a', 'b'], 1, async (x) => {
      orden.push(`ini-${x}`)
      await pausa(2)
      orden.push(`fin-${x}`)
    })
    expect(orden).toEqual(['ini-a', 'fin-a', 'ini-b', 'fin-b'])
  })

  it('una lista vacía o un límite mayor a la lista no rompen', async () => {
    expect(await enParalelo([], 4, async (x) => x)).toEqual([])
    expect(await enParalelo([1, 2], 10, async (x) => x * 2)).toEqual([2, 4])
  })

  it('un límite inválido (0, negativo, NaN) se trata como 1, no deja la corrida colgada', async () => {
    for (const limite of [0, -2, Number.NaN]) {
      expect(await enParalelo([1, 2, 3], limite, async (x) => x)).toEqual([1, 2, 3])
    }
  })
})
