import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FiltrosContenido } from './filtros'
import { parsearFiltrosContenido } from '@/lib/contenidista/filtros'
import { MARCAS } from '@/lib/datos/marcas'

const datos = (c: HTMLElement) => new FormData(c.querySelector('form')!)

describe('<FiltrosContenido>', () => {
  it('formulario GET a /contenido con marca, plataforma y estado; conserva el plan elegido', () => {
    const f = parsearFiltrosContenido({ marca: MARCAS[1]!.id, plataforma: 'facebook', estado: 'aprobada' })
    const { container } = render(<FiltrosContenido filtros={f} planId="plan-1" />)
    expect(container.querySelector('form')).toHaveAttribute('action', '/contenido')
    expect(screen.getByRole('group', { name: /Marcas/ })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /Plataforma/ })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /Estado/ })).toBeInTheDocument()
    const d = datos(container)
    expect(d.getAll('marca')).toEqual([MARCAS[1]!.id])
    expect(d.getAll('plataforma')).toEqual(['facebook'])
    expect(d.getAll('estado')).toEqual(['aprobada'])
    expect(d.get('plan')).toBe('plan-1')
  })
  it('sin filtros están todos marcados y no hay fechas', () => {
    const { container } = render(<FiltrosContenido filtros={parsearFiltrosContenido({})} planId="p" />)
    const d = datos(container)
    expect(d.getAll('marca')).toHaveLength(MARCAS.length)
    expect(d.getAll('estado')).toEqual(['borrador', 'aprobada', 'descartada'])
    expect(screen.queryByLabelText(/desde/i)).toBeNull()
  })
})
