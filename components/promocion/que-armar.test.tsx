import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueArmar } from './que-armar'

describe('<QueArmar> · paso 0', () => {
  it('pregunta qué armar y ofrece las opciones como links grandes a su ?que=', () => {
    render(<QueArmar />)
    expect(screen.getByRole('heading', { name: '¿Qué querés armar?' })).toBeInTheDocument()
    const lista = screen.getByRole('list')
    const links = within(lista).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/promocionar/nueva?que=una', '/promocionar/nueva?que=motos', '/promocionar/nueva?que=textos'])
  })

  it('cada opción dice en una línea qué es y cuánto cuesta la imagen, aproximado', () => {
    render(<QueArmar />)
    expect(screen.getByRole('link', { name: /Una moto/ })).toHaveTextContent(/~US\$ 0,045/)
    expect(screen.getByRole('link', { name: /Varias motos, mismo diseño/ })).toHaveTextContent(/cada moto.*~US\$ 0,045/)
    expect(screen.getByRole('link', { name: /Varios textos para una moto/ })).toHaveTextContent(/una sola imagen/i)
  })

  it('aclara que elegir no cuesta nada', () => {
    render(<QueArmar />)
    expect(screen.getByText(/Elegir no cuesta nada/)).toBeInTheDocument()
  })
})
