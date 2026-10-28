import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FiltrosLista } from './filtros-lista'
import { MARCAS } from '@/lib/datos/marcas'

const datos = (c: HTMLElement) => new FormData(c.querySelector('form')!)

describe('<FiltrosLista>', () => {
  it('formulario GET a /promocionar con marcas ("marca") y modelo', () => {
    const { container } = render(<FiltrosLista filtros={{ marcaIds: [MARCAS[1]!.id], modelo: 'TRK' }} />)
    expect(container.querySelector('form')).toHaveAttribute('action', '/promocionar')
    expect(screen.getByRole('group', { name: /Marcas/ })).toBeInTheDocument()
    expect(datos(container).getAll('marca')).toEqual([MARCAS[1]!.id])
    expect(screen.getByLabelText('Modelo')).toHaveValue('TRK')
    expect(datos(container).get('modelo')).toBe('TRK')
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeInTheDocument()
  })
  it('no tiene plataforma ni fechas: la lista no las usa', () => {
    render(<FiltrosLista filtros={{ marcaIds: [MARCAS[1]!.id], modelo: '' }} />)
    expect(screen.queryByRole('group', { name: /Plataforma/ })).toBeNull()
    expect(screen.queryByLabelText(/desde/i)).toBeNull()
  })
  it('al filtrar se queda en la pestaña elegida (y vuelve a la página 1)', () => {
    const { container } = render(<FiltrosLista filtros={{ marcaIds: [MARCAS[1]!.id], modelo: '' }} ver="historial" />)
    expect(datos(container).get('ver')).toBe('historial')
    expect(datos(container).get('pagina')).toBeNull()
  })
  it('en la pestaña por defecto no manda `ver`', () => {
    const { container } = render(<FiltrosLista filtros={{ marcaIds: [MARCAS[1]!.id], modelo: '' }} ver="terminar" />)
    expect(datos(container).get('ver')).toBeNull()
  })
})
