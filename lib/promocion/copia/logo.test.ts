// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { logoDibujable } from './logo'
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
