// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { logoDibujable, logoParaPegar } from './logo'
import { leerManifiesto } from '../logos-servidor'
import { MARCAS } from '../../datos/marcas'

describe('logoDibujable (usa el manifiesto real)', () => {
  const m = () => leerManifiesto()
  it('999motos: el logo 999 siempre se puede dibujar', () => expect(logoDibujable(m(), MARCAS[0]!.id)).toBe(true))
  it('Motoplex (PNG) sí', () => expect(logoDibujable(m(), MARCAS[1]!.id)).toBe(true))
  it('Benelli (WebP) no: satori no lo lee', () => expect(logoDibujable(m(), MARCAS[3]!.id)).toBe(false))
  it('QJ (sin logo) no', () => expect(logoDibujable(m(), MARCAS[4]!.id)).toBe(false))
  it('una marca que no está en el manifiesto no', () => expect(logoDibujable(m(), 'inexistente')).toBe(false))
})

describe('logoParaPegar (manifiesto real)', () => {
  const m = () => leerManifiesto()
  it('999motos: el logo 999', () => expect(logoParaPegar(m(), MARCAS[0]!.id, 'oscuro')).toEqual({ id: 'logo999', placaClara: false }))
  it('una concesionaria con logo PNG: el suyo', () => expect(logoParaPegar(m(), MARCAS[2]!.id, 'claro')?.id).toMatch(new RegExp(`^${MARCAS[2]!.id}_`)))
  it('sin logo dibujable (WebP, sin logo, marca desconocida): null', () => {
    for (const id of [MARCAS[3]!.id, MARCAS[4]!.id, 'inexistente']) expect(logoParaPegar(m(), id, 'oscuro')).toBeNull()
  })
  it('sin dato del fondo se asume oscuro', () => expect(logoParaPegar(m(), MARCAS[2]!.id, null)).toEqual(logoParaPegar(m(), MARCAS[2]!.id, 'oscuro')))
})
