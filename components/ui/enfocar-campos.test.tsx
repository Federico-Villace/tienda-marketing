import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EnfocarCampos } from './enfocar-campos'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('<EnfocarCampos>', () => {
  it('en el celu trae al medio el campo de texto que se toca, pero no un radio', () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const mover = vi.fn()
    Element.prototype.scrollIntoView = mover
    render(
      <>
        <EnfocarCampos />
        <input aria-label="precio" />
        <input type="radio" aria-label="opcion" />
      </>,
    )
    fireEvent.focusIn(screen.getByRole('radio'))
    vi.advanceTimersByTime(400)
    expect(mover).not.toHaveBeenCalled()
    fireEvent.focusIn(screen.getByRole('textbox', { name: 'precio' }))
    vi.advanceTimersByTime(400)
    expect(mover).toHaveBeenCalledTimes(1)
  })
})
