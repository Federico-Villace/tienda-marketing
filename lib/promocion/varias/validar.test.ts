import { describe, it, expect } from 'vitest'
import { validarMotosExtra } from './validar'

const F1 = '11111111-1111-4111-8111-111111111111'
const F2 = '22222222-2222-4222-8222-222222222222'
const F3 = '33333333-3333-4333-8333-333333333333'
const F4 = '44444444-4444-4444-8444-444444444444'
const F5 = '55555555-5555-4555-8555-555555555555'

const moto = (o: Record<string, unknown> = {}) => ({
  fotoId: F2,
  modelo: 'Rouser 200',
  precio: { moneda: 'ARS', monto: 4_500_000 },
  promo: { tipo: 'cuotas', detalle: '12 cuotas sin interés' },
  ...o,
})
const ok = (x: unknown, principal: string | null = F1) => validarMotosExtra(x, { fotoPrincipalId: principal })
const errores = (x: unknown, principal: string | null = F1) => {
  const r = ok(x, principal)
  if (r.ok) throw new Error('debía fallar')
  return r.errores
}

describe('cuántas motos', () => {
  it('de 1 a 3 extras (la placa lleva de 2 a 4 motos con la principal)', () => {
    expect(ok([moto()]).ok).toBe(true)
    expect(ok([moto(), moto({ fotoId: F3 }), moto({ fotoId: F4 })]).ok).toBe(true)
  })
  it('sin extras, o con 4 extras (5 motos), no vale', () => {
    expect(errores([])[0]).toMatch(/2 a 4 motos/)
    expect(errores([moto(), moto({ fotoId: F3 }), moto({ fotoId: F4 }), moto({ fotoId: F5 })])[0]).toMatch(/2 a 4 motos/)
  })
  it('algo que no es una lista no vale', () => {
    expect(errores(null)[0]).toMatch(/2 a 4 motos/)
    expect(errores({})[0]).toMatch(/2 a 4 motos/)
    expect(errores('x')[0]).toMatch(/2 a 4 motos/)
  })
})

describe('cada moto', () => {
  it('devuelve el objeto limpio, con el monto entero tal cual', () => {
    const r = ok([moto({ modelo: '  Rouser 200  ' })])
    expect(r.ok && r.motos).toEqual([{ fotoId: F2, modelo: 'Rouser 200', precio: { moneda: 'ARS', monto: 4_500_000 }, promo: { tipo: 'cuotas', detalle: '12 cuotas sin interés' } }])
  })
  it('el error dice de qué moto habla (la principal es la 1, la primera extra es la 2)', () => {
    expect(errores([moto(), moto({ fotoId: F3, modelo: 'x' })]).some((e) => e.startsWith('Moto 3: '))).toBe(true)
    expect(errores([moto({ modelo: 'x' })]).every((e) => e.startsWith('Moto 2: '))).toBe(true)
  })
  it('un elemento que no es objeto', () => {
    expect(errores(['x'])[0]).toMatch(/^Moto 2: /)
  })
  it('claves de más no se aceptan', () => {
    expect(errores([moto({ costo: 1 })]).join(' ')).toMatch(/"costo" no está permitido/)
  })
  it('la foto tiene que ser un UUID', () => {
    expect(errores([moto({ fotoId: 'nope' })]).join(' ')).toMatch(/Falta la foto/)
    expect(errores([moto({ fotoId: undefined })]).join(' ')).toMatch(/Falta la foto/)
  })
  it('modelo de 2 a 60 caracteres, sin emojis', () => {
    expect(errores([moto({ modelo: 'a' })]).length).toBeGreaterThan(0)
    expect(errores([moto({ modelo: 'a'.repeat(61) })]).length).toBeGreaterThan(0)
    expect(ok([moto({ modelo: 'a'.repeat(60) })]).ok).toBe(true)
    expect(errores([moto({ modelo: 'Rouser 🏍️' })]).join(' ')).toMatch(/emojis/)
  })
  it.each([
    ['texto', '4.500.000'],
    ['decimal', 4500.5],
    ['cero', 0],
    ['negativo', -1],
    ['más del tope en pesos', 1_000_000_000],
    ['NaN', Number.NaN],
  ])('el precio tiene que ser un entero positivo: %s', (_n, monto) => {
    expect(errores([moto({ precio: { moneda: 'ARS', monto } })]).length).toBeGreaterThan(0)
  })
  it('el tope de dólares es otro', () => {
    expect(ok([moto({ precio: { moneda: 'USD', monto: 9_999_999 } })]).ok).toBe(true)
    expect(errores([moto({ precio: { moneda: 'USD', monto: 10_000_000 } })]).length).toBeGreaterThan(0)
  })
  it('moneda inválida o precio ausente', () => {
    expect(errores([moto({ precio: { moneda: 'EUR', monto: 1 } })]).length).toBeGreaterThan(0)
    expect(errores([moto({ precio: undefined })]).length).toBeGreaterThan(0)
  })
  it('la condición (promo) es opcional: ninguna sin detalle vale; un detalle con teléfono, no', () => {
    expect(ok([moto({ promo: { tipo: 'ninguna', detalle: '' } })]).ok).toBe(true)
    expect(ok([moto({ promo: { tipo: 'ninguna' } })]).ok).toBe(true)
    expect(errores([moto({ promo: { tipo: 'cuotas', detalle: 'llamá al 11 4444 5555' } })]).length).toBeGreaterThan(0)
    expect(errores([moto({ promo: { tipo: 'rara', detalle: '' } })]).length).toBeGreaterThan(0)
    expect(errores([moto({ promo: { tipo: 'cuotas', detalle: 'x'.repeat(81) } })]).length).toBeGreaterThan(0)
  })
})

describe('fotos repetidas', () => {
  it('una foto no puede repetirse entre las extras', () => {
    expect(errores([moto(), moto()]).join(' ')).toMatch(/misma foto/)
  })
  it('ni coincidir con la de la moto principal', () => {
    expect(errores([moto({ fotoId: F1 })], F1).join(' ')).toMatch(/misma foto/)
  })
  it('si no se conoce la principal, solo se comparan entre sí', () => {
    expect(ok([moto({ fotoId: F1 })], null).ok).toBe(true)
  })
})
