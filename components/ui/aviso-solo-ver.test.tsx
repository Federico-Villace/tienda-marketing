import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AvisoSoloVer, TEXTO_SOLO_VER } from './aviso-solo-ver'

describe('AvisoSoloVer', () => {
  it('es el mismo aviso en todas las pantallas', () => {
    expect(TEXTO_SOLO_VER).toBe('Tu rol solo permite ver. Para crear o aprobar, pedile acceso a Federico.')
    render(<AvisoSoloVer />)
    expect(screen.getByRole('note')).toHaveTextContent(TEXTO_SOLO_VER)
  })
})
