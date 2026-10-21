import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HistorialTandas } from './historial'
import { tandaVista } from './fixture'

describe('HistorialTandas', () => {
  it('sin tandas anteriores no muestra nada', () => {
    const { container } = render(<HistorialTandas planId="p1" tandas={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lista cada tanda con sus notas, modelo y costo, y un link para verla', () => {
    render(<HistorialTandas planId="p1" tandas={[tandaVista({ id: 'ta', notas: 'Foco en financiación' }), tandaVista({ id: 'tb', notas: null })]} />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(screen.getByText(/Foco en financiación/)).toBeInTheDocument()
    expect(screen.getByText(/sin notas/i)).toBeInTheDocument()
    expect(screen.getAllByText(/gpt-6-luna/)).toHaveLength(2)
    const link = screen.getAllByRole('link')[0]!
    expect(link).toHaveAttribute('href', '/contenido?plan=p1&tanda=ta')
  })
})
