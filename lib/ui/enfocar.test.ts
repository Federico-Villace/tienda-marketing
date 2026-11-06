import { describe, it, expect, vi, afterEach } from 'vitest'
import { alEnfocarVisible } from './enfocar'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const campo = () => ({ currentTarget: { scrollIntoView: vi.fn() } as unknown as Element })

describe('alEnfocarVisible', () => {
  it('en el celu trae el campo al medio después de que sube el teclado', () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const e = campo()
    alEnfocarVisible(e)
    expect(e.currentTarget.scrollIntoView).not.toHaveBeenCalled()
    vi.advanceTimersByTime(300)
    expect(e.currentTarget.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
  })

  it('en escritorio no mueve nada', () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const e = campo()
    alEnfocarVisible(e)
    vi.advanceTimersByTime(1000)
    expect(e.currentTarget.scrollIntoView).not.toHaveBeenCalled()
  })
})
