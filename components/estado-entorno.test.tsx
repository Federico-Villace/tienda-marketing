import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PanelEntorno } from './estado-entorno'
import { revisarEntorno, REQUISITOS } from '@/lib/entorno'

describe('PanelEntorno', () => {
  const conTodas = () =>
    revisarEntorno(
      Object.fromEntries(REQUISITOS.map((r) => [r.nombre, 'un-valor-secreto'])),
    )

  it('renderiza sin variables configuradas', () => {
    render(<PanelEntorno estado={revisarEntorno({})} />)
    expect(screen.getByText(/Faltan \d+ variables obligatorias/)).toBeInTheDocument()
  })

  it('lista cada variable declarada', () => {
    render(<PanelEntorno estado={revisarEntorno({})} />)
    for (const requisito of REQUISITOS) {
      expect(screen.getByText(requisito.nombre)).toBeInTheDocument()
    }
  })

  it('avisa cuando el entorno está completo', () => {
    render(<PanelEntorno estado={conTodas()} />)
    expect(screen.getByText(/Entorno completo/)).toBeInTheDocument()
  })

  it('nunca imprime el valor de una variable', () => {
    const { container } = render(<PanelEntorno estado={conTodas()} />)
    expect(container.textContent).not.toContain('un-valor-secreto')
  })

  it('agrupa por servicio', () => {
    render(<PanelEntorno estado={revisarEntorno({})} />)
    expect(screen.getByText('Meta')).toBeInTheDocument()
    expect(screen.getByText('Supabase')).toBeInTheDocument()
  })

  it('distingue las opcionales de las obligatorias', () => {
    render(<PanelEntorno estado={revisarEntorno({})} />)
    const opcionales = REQUISITOS.filter((r) => !r.obligatoria)
    expect(screen.getAllByText('opcional')).toHaveLength(opcionales.length)
  })
})
