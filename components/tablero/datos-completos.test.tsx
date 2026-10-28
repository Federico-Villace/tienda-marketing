import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DatosCompletos } from './datos-completos'

describe('DatosCompletos', () => {
  it('arranca cerrado y conserva todo el contenido adentro', () => {
    const { container } = render(
      <DatosCompletos>
        <table aria-label="Rendimiento por día" />
        <p>Mensajes recibidos</p>
      </DatosCompletos>,
    )
    const detalles = container.querySelector('details')!
    expect(detalles.open).toBe(false)
    expect(screen.getByText('Ver los datos completos').tagName).toBe('SUMMARY')
    expect(detalles).toContainElement(screen.getByText('Mensajes recibidos'))
    expect(detalles).toContainElement(container.querySelector('table')!)
  })
})
