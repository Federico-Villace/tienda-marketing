import { describe, it, expect } from 'vitest'
import { pasoActual, pasosAlcanzados, type EntradaPaso } from './paso'

const base = (o: Partial<EntradaPaso> = {}): EntradaPaso => ({ estado: 'borrador', analisisId: null, textosId: 'tx', copy: { titular: 't' } as never, plantilla: null, escenaCreativoId: null, placaLista: false, ...o })

describe('el paso de una placa con la grilla de motos', () => {
  it('sin plantilla sigue en el 4 (como siempre)', () => expect(pasoActual(base())).toBe(4))
  it('con la grilla elegida pero sin la placa armada, sigue en el 4', () => expect(pasoActual(base({ plantilla: 'varias_motos' }))).toBe(4))
  it('con la grilla y la placa armada pasa al 5 SIN escena de IA', () => {
    expect(pasoActual(base({ plantilla: 'varias_motos', placaLista: true }))).toBe(5)
    expect(pasosAlcanzados(base({ plantilla: 'varias_motos', placaLista: true }))).toEqual([1, 2, 3, 4, 5])
  })
  it('las demás plantillas siguen exigiendo su escena para pasar al 5', () => {
    expect(pasoActual(base({ plantilla: 'oferta_abajo', placaLista: true }))).toBe(4)
    expect(pasoActual(base({ plantilla: 'oferta_abajo', placaLista: true, escenaCreativoId: 'e' }))).toBe(5)
  })
  it('aprobada es el 6 y descartada el 1, con cualquier plantilla', () => {
    expect(pasoActual(base({ estado: 'aprobada', plantilla: 'varias_motos' }))).toBe(6)
    expect(pasoActual(base({ estado: 'descartada', plantilla: 'varias_motos' }))).toBe(1)
  })
})
