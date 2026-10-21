import { describe, it, expect } from 'vitest'
import { claveDeMonto, montosNoRespaldados, reemplazarMontos } from './montos'
import { piezasDePrueba } from './fixture'

describe('claveDeMonto', () => {
  it('normaliza separadores y moneda', () => {
    expect(claveDeMonto('$ 1.500.000')).toBe('moneda:1500000')
    expect(claveDeMonto('US$1,500')).toBe('moneda:1500')
    expect(claveDeMonto('ARS 90.000,')).toBe('moneda:90000')
  })
  it('mil, millones y k multiplican', () => {
    expect(claveDeMonto('$ 90 mil')).toBe('moneda:90000')
    expect(claveDeMonto('$2 millones')).toBe('moneda:2000000')
    expect(claveDeMonto('USD 5k')).toBe('moneda:5000')
    expect(claveDeMonto('$1,5 millones')).toBe('moneda:1500000')
  })
  it('porcentaje y cuotas tienen su propio tipo', () => {
    expect(claveDeMonto('15%')).toBe('porcentaje:15')
    expect(claveDeMonto('12 cuotas')).toBe('cuotas:12')
    expect(claveDeMonto('3.000 pesos')).toBe('moneda:3000')
  })
})

describe('montosNoRespaldados', () => {
  it('un monto presente en la fuente (con otro formato) está respaldado', () => {
    expect(montosNoRespaldados('Contado $ 1.500.000', 'precio 1500000')).toEqual([])
    expect(montosNoRespaldados('En 12 cuotas', 'Financiación en 12 cuotas')).toEqual([])
    expect(montosNoRespaldados('10% off', 'bonificación del 10%')).toEqual([])
  })
  it('un monto ausente de la fuente no está respaldado', () => {
    expect(montosNoRespaldados('Hoy $1.500.000', 'sin precios')).toEqual(['$1.500.000'])
    expect(montosNoRespaldados('15% de descuento y 6 cuotas', 'solo 12 cuotas')).toEqual(['15%', '6 cuotas'])
  })
  it('el tipo cuenta: 12 cuotas no respalda 12%', () => {
    expect(montosNoRespaldados('12%', '12 cuotas')).toEqual(['12%'])
  })
  it('"0km", "3 unidades", "12 meses" y [precio] no son montos', () => {
    expect(montosNoRespaldados('0km, 3 unidades, 12 meses, [precio]', '')).toEqual([])
  })
})

describe('reemplazarMontos', () => {
  it('cambia por [precio] solo lo no respaldado, en todos los campos de texto', () => {
    const [p] = piezasDePrueba()
    const r = reemplazarMontos(
      { ...p!, hook: 'Desde $999.999', copy: 'Contado $ 1.500.000 o 6 cuotas', cta: '20% off', guion: 'Decí $1 mil', briefVisual: 'Texto "$50"', altText: null },
      'Contado 1500000',
    )
    expect(r.hook).toBe('Desde [precio]')
    expect(r.copy).toBe('Contado $ 1.500.000 o [precio]')
    expect(r.cta).toBe('[precio] off')
    expect(r.guion).toBe('Decí [precio]')
    expect(r.briefVisual).toBe('Texto "[precio]"')
    expect(r.altText).toBeNull()
  })
  it('no toca una pieza sin montos inventados', () => {
    const [p] = piezasDePrueba()
    expect(reemplazarMontos(p!, '')).toEqual(p)
  })
})
