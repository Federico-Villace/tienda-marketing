import { describe, it, expect } from 'vitest'
import { maxDuration } from './route'

describe('POST /api/creativos/[id]/verificacion', () => {
  it('declara maxDuration 120 (la revisión tiene 75 s de timeout y falta la descarga y la compuerta)', () => {
    expect(maxDuration).toBe(120)
  })
})
