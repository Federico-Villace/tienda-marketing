import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NOMBRES_PASOS, Stepper } from './stepper'

const hrefDe = (n: number) => `/promocionar/abc?paso=${n}`

describe('<Stepper>', () => {
  it('es una lista ordenada con los 6 pasos y su nombre', () => {
    render(<Stepper visible={3} alcanzados={[1, 2, 3]} hrefDe={hrefDe} />)
    const lista = screen.getByRole('list')
    expect(lista.tagName).toBe('OL')
    expect(screen.getAllByRole('listitem')).toHaveLength(6)
    for (const n of NOMBRES_PASOS) expect(screen.getAllByText(n).length).toBeGreaterThan(0)
  })

  it('anuncia "Paso 3 de 6" y marca el paso visible con aria-current="step"', () => {
    render(<Stepper visible={3} alcanzados={[1, 2, 3]} hrefDe={hrefDe} />)
    expect(screen.getByText('Paso 3 de 6')).toBeInTheDocument()
    const actual = screen.getAllByRole('listitem').filter((li) => li.querySelector('[aria-current="step"]'))
    expect(actual).toHaveLength(1)
    expect(actual[0]).toHaveTextContent(/Textos/)
  })

  it('solo se navega a los pasos alcanzados y distintos del visible', () => {
    render(<Stepper visible={3} alcanzados={[1, 2, 3]} hrefDe={hrefDe} />)
    expect(screen.getByRole('link', { name: /Qué promocionás/ })).toHaveAttribute('href', '/promocionar/abc?paso=1')
    expect(screen.getByRole('link', { name: /Cómo nos fue/ })).toHaveAttribute('href', '/promocionar/abc?paso=2')
    expect(screen.queryByRole('link', { name: /Imagen/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Aprobar/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Textos/ })).toBeNull()
  })

  it('lee el estado de cada paso (hecho, actual, pendiente) para quien no ve los colores', () => {
    render(<Stepper visible={2} alcanzados={[1, 2, 3]} hrefDe={hrefDe} pasoActual={3} />)
    expect(screen.getAllByText('(hecho)').length).toBe(1)
    expect(screen.getAllByText('(te toca)').length).toBe(1)
    expect(screen.getAllByText('(paso que estás viendo)').length).toBe(1)
    expect(screen.getAllByText('(pendiente)').length).toBe(3)
  })
})
