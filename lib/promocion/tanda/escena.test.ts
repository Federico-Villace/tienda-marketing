import { describe, it, expect } from 'vitest'
import { compartenEscena, escenaEsDe } from './escena'
import { datosDePrueba } from '../fixture'

const hija = (o: Record<string, unknown> = {}) => ({
  foto_id: 'f1',
  aspecto: '4:5' as const,
  plantilla: 'oferta_abajo',
  fondo: 'fondo_estudio',
  datos: datosDePrueba(),
  ...o,
})

describe('compartenEscena', () => {
  it('hijas con la misma foto, formato, diseño, fondo e indicaciones comparten', () => {
    expect(compartenEscena([hija(), hija(), hija()])).toEqual({ ok: true })
  })

  it('el precio, la promo y el lugar NO entran: la escena no los usa', () => {
    const otra = hija({ datos: { ...datosDePrueba(), precio: { moneda: 'USD', monto: 1 }, lugar: 'Berazategui' } })
    expect(compartenEscena([hija(), otra])).toEqual({ ok: true })
  })

  it('dice cuáles difieren, una sola vez cada una y en orden fijo', () => {
    const r = compartenEscena([
      hija(),
      hija({ foto_id: 'f2', fondo: 'escenario_ruta', datos: { ...datosDePrueba(), indicaciones: 'luz de tarde' } }),
      hija({ aspecto: '9:16', plantilla: 'catalogo' }),
    ])
    expect(r).toEqual({ ok: false, difieren: ['foto', 'formato', 'diseño', 'fondo', 'indicaciones'] })
  })

  it('una sola hija comparte consigo misma; ninguna también (lo valida quien llama)', () => {
    expect(compartenEscena([hija()])).toEqual({ ok: true })
    expect(compartenEscena([])).toEqual({ ok: true })
  })
})

describe('escenaEsDe', () => {
  const promo = { id: 'p1', tanda_id: 't1' }
  it('una generación de la propia promoción es de ella', () => {
    expect(escenaEsDe({ promocion_id: 'p1', tanda_id: null }, promo)).toBe(true)
  })
  it('una generación de la MISMA tanda también', () => {
    expect(escenaEsDe({ promocion_id: null, tanda_id: 't1' }, promo)).toBe(true)
  })
  it('la de otra tanda, la de otra promoción o ninguna no', () => {
    expect(escenaEsDe({ promocion_id: null, tanda_id: 't2' }, promo)).toBe(false)
    expect(escenaEsDe({ promocion_id: 'p2', tanda_id: null }, promo)).toBe(false)
    expect(escenaEsDe({ promocion_id: null, tanda_id: null }, promo)).toBe(false)
    expect(escenaEsDe(null, promo)).toBe(false)
  })
  it('una promoción suelta nunca acepta una generación de tanda', () => {
    expect(escenaEsDe({ promocion_id: null, tanda_id: 't1' }, { id: 'p1', tanda_id: null })).toBe(false)
  })
  it('tolera filas sin la columna tanda_id', () => {
    expect(escenaEsDe({ promocion_id: 'p1' }, { id: 'p1', tanda_id: null })).toBe(true)
    expect(escenaEsDe({ promocion_id: null }, { id: 'p1', tanda_id: null })).toBe(false)
  })
})
