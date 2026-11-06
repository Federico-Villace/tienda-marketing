import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { EditorConVistaPrevia } from './editor-con-vista-previa'

describe('EditorConVistaPrevia', () => {
  it('pone los controles en su región y la vista previa en el costado, cada una una sola vez', () => {
    render(<EditorConVistaPrevia controles={<button>Un control</button>} previa={<img alt="La previa" src="x.png" />} />)
    const controles = screen.getByRole('region', { name: 'Controles' })
    const previa = screen.getByRole('complementary', { name: 'Vista previa' })
    expect(within(controles).getByRole('button', { name: 'Un control' })).toBeInTheDocument()
    expect(within(previa).getAllByRole('img', { name: 'La previa' })).toHaveLength(1)
    expect(screen.getAllByRole('img', { name: 'La previa' })).toHaveLength(1)
    expect(previa).toHaveAttribute('data-testid', 'vista-previa-fija')
  })
})
