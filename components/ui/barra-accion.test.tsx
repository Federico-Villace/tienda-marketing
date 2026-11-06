import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { BarraAccion } from './barra-accion'

describe('<BarraAccion>', () => {
  it('lleva adentro la acción principal del paso', () => {
    render(
      <BarraAccion>
        <button type="button">Seguir</button>
      </BarraAccion>,
    )
    const barra = screen.getByTestId('barra-accion')
    expect(within(barra).getByRole('button', { name: 'Seguir' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Acción principal' })).toBe(barra)
  })
})
