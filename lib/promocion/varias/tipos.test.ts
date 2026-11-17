import { describe, it, expect } from 'vitest'
import { esVariasMotos, motosDeLaPlaca, type MotoExtra } from './tipos'
import { filaPromocion } from '../fixture'

const extra = (n: number): MotoExtra => ({ fotoId: `f${n}`, modelo: `Moto ${n}`, precio: { moneda: 'ARS', monto: n * 1000 }, promo: { tipo: 'ninguna', detalle: '' } })

describe('motosDeLaPlaca', () => {
  it('una promoción de una moto sola es una lista de una', () => {
    const p = filaPromocion({ foto_id: 'f1', modelo: 'TRK 502' })
    expect(esVariasMotos(p)).toBe(false)
    expect(motosDeLaPlaca(p)).toEqual([{ fotoId: 'f1', modelo: 'TRK 502', precio: p.datos.precio, promo: p.datos.promo }])
  })
  it('la principal va primero y las extras detrás, en orden', () => {
    const p = filaPromocion({ foto_id: 'f1', modelo: 'TRK 502', motos_extra: [extra(2), extra(3)] })
    expect(esVariasMotos(p)).toBe(true)
    expect(motosDeLaPlaca(p).map((m) => m.fotoId)).toEqual(['f1', 'f2', 'f3'])
  })
  it('una lista vacía o basura no cuenta como varias motos', () => {
    expect(esVariasMotos({ motos_extra: [] })).toBe(false)
    expect(esVariasMotos({ motos_extra: null })).toBe(false)
    expect(esVariasMotos({})).toBe(false)
    expect(esVariasMotos({ motos_extra: 'x' })).toBe(false)
  })
})
