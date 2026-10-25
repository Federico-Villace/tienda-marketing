import { describe, it, expect } from 'vitest'
import { textosParaPlaca } from './textos-placa'
import { datosDePrueba } from './fixture'

const base = { marca: 'Benelli Store Quilmes', modelo: 'TRK 502', datos: datosDePrueba(), titular: 'Mi titular', titularDelTexto: 'Titular del texto' }

describe('textosParaPlaca', () => {
  it('el precio sale del dato cargado, formateado, sin que intervenga ningún modelo', () => {
    expect(textosParaPlaca(base)).toEqual({
      marca: 'Benelli Store Quilmes',
      modelo: 'TRK 502',
      precio: '$ 4.500.000',
      promo: '12 cuotas sin interés',
      titular: 'Mi titular',
      lugar: 'Quilmes',
    })
  })
  it('el titular editado gana; si no hay, el del texto elegido; si no, vacío', () => {
    expect(textosParaPlaca({ ...base, titular: null }).titular).toBe('Titular del texto')
    expect(textosParaPlaca({ ...base, titular: null, titularDelTexto: null }).titular).toBe('')
  })
  it('dólares y promoción sin detalle', () => {
    const t = textosParaPlaca({ ...base, datos: { ...datosDePrueba(), precio: { moneda: 'USD', monto: 5990 }, promo: { tipo: 'contado', detalle: '' } } })
    expect(t).toMatchObject({ precio: 'US$ 5.990', promo: 'Contado' })
  })
})
