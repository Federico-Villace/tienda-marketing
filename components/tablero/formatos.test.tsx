import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Formatos } from './formatos'

describe('Formatos', () => {
  it('cada barra trae su cifra en texto (no depende del color ni del ancho)', () => {
    render(
      <Formatos
        filas={[{ tipo: 'reel', publicaciones: 12, vistasPromedio: 2100, tasaPct: 5.2, anchoPct: 100, muestraChica: false }]}
      />,
    )
    expect(screen.getByText(/2\.100 vistas por publicación/)).toBeInTheDocument()
  })

  it('sin publicaciones no dibuja nada', () => {
    const { container } = render(<Formatos filas={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
