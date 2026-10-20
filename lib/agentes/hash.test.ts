import { describe, it, expect } from 'vitest'
import { hashJson } from './hash'

describe('hashJson', () => {
  it('es determinista y tiene forma de sha256 hex', () => {
    expect(hashJson({ a: 1, b: [1, 2] })).toBe(hashJson({ a: 1, b: [1, 2] }))
    expect(hashJson({ a: 1 })).toMatch(/^[0-9a-f]{64}$/)
  })

  it('el mismo objeto con las claves en otro orden da el mismo hash', () => {
    expect(hashJson({ a: 1, b: { x: 1, y: 2 } })).toBe(hashJson({ b: { y: 2, x: 1 }, a: 1 }))
  })

  it('un valor distinto da un hash distinto', () => {
    expect(hashJson({ a: 1 })).not.toBe(hashJson({ a: 2 }))
  })

  it('el orden de un array sí importa', () => {
    expect(hashJson([1, 2])).not.toBe(hashJson([2, 1]))
  })
})
