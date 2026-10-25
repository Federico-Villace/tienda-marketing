import { describe, it, expect } from 'vitest'
import { pasoActual, pasosAlcanzados, type EntradaPaso } from './paso'

const base: EntradaPaso = {
  estado: 'borrador',
  analisisId: null,
  textosId: null,
  copy: null,
  plantilla: null,
  escenaCreativoId: null,
  placaLista: false,
}
const copy = { titular: 't', hook: 'h', copy: 'c', hashtags: ['#a', '#b', '#c'], cta: 'x', altText: 'a' }
const con = (o: Partial<EntradaPaso>): EntradaPaso => ({ ...base, ...o })

describe('pasoActual', () => {
  it('recién creada, sin análisis ni textos: paso 2 (cómo nos fue)', () => {
    expect(pasoActual(base)).toBe(2)
  })
  it('con análisis y sin texto elegido: paso 3', () => {
    expect(pasoActual(con({ analisisId: 'a' }))).toBe(3)
  })
  it('si ya pidió textos sin pasar por el análisis (lo salteó): paso 3', () => {
    expect(pasoActual(con({ textosId: 't' }))).toBe(3)
  })
  it('con texto elegido y sin escena: paso 4', () => {
    expect(pasoActual(con({ copy }))).toBe(4)
  })
  it('con texto y escena pero sin diseño: paso 4', () => {
    expect(pasoActual(con({ copy, escenaCreativoId: 'e' }))).toBe(4)
  })
  it('con texto, escena y diseño pero sin placa final: paso 4', () => {
    expect(pasoActual(con({ copy, escenaCreativoId: 'e', plantilla: 'oferta_abajo' }))).toBe(4)
  })
  it('borrador completo (texto, escena, diseño y placa): paso 5', () => {
    expect(pasoActual(con({ copy, escenaCreativoId: 'e', plantilla: 'oferta_abajo', placaLista: true }))).toBe(5)
  })
  it('aprobada: paso 6', () => {
    expect(pasoActual(con({ estado: 'aprobada', copy, escenaCreativoId: 'e', plantilla: 'catalogo', placaLista: true }))).toBe(6)
  })
  it('descartada: vuelve al principio', () => {
    expect(pasoActual(con({ estado: 'descartada' }))).toBe(1)
  })
})

describe('pasosAlcanzados', () => {
  it('hasta el paso actual', () => {
    expect(pasosAlcanzados(con({ analisisId: 'a' }))).toEqual([1, 2, 3])
  })
  it('el paso 2 se puede saltear: desde ahí ya se llega al 3', () => {
    expect(pasosAlcanzados(base)).toEqual([1, 2, 3])
  })
  it('aprobada: los 6', () => {
    expect(pasosAlcanzados(con({ estado: 'aprobada', copy, escenaCreativoId: 'e', plantilla: 'catalogo', placaLista: true }))).toEqual([1, 2, 3, 4, 5, 6])
  })
  it('borrador completo: hasta el 5', () => {
    expect(pasosAlcanzados(con({ copy, escenaCreativoId: 'e', plantilla: 'x', placaLista: true }))).toEqual([1, 2, 3, 4, 5])
  })
})
