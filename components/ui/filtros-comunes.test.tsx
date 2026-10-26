import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FiltrosComunes } from './filtros-comunes'
import { MARCAS } from '@/lib/datos/marcas'

const periodo = { desde: '2026-09-01', hasta: '2026-09-30', minimo: '2026-07-23', maximo: '2026-10-20' }
const datos = (c: HTMLElement) => new FormData(c.querySelector('form')!)

describe('FiltrosComunes', () => {
  it('es UN formulario GET hacia la acción pedida', () => {
    const { container } = render(<FiltrosComunes accion="/contenido" marcaIds={[MARCAS[1]!.id]} />)
    expect(container.querySelectorAll('form')).toHaveLength(1)
    expect(container.querySelector('form')).toHaveAttribute('action', '/contenido')
  })

  it('las marcas viajan como `marca` repetido, con la leyenda "Marcas"', () => {
    const { container } = render(<FiltrosComunes accion="/x" marcaIds={[MARCAS[1]!.id, MARCAS[3]!.id]} />)
    expect(screen.getByRole('group', { name: /Marcas/ })).toBeInTheDocument()
    expect(datos(container).getAll('marca')).toEqual([MARCAS[1]!.id, MARCAS[3]!.id])
  })

  it('la plataforma se llama "Plataforma"; "todas" marca las dos', () => {
    const { container, rerender } = render(<FiltrosComunes accion="/x" marcaIds={[MARCAS[0]!.id]} plataforma="todas" />)
    expect(screen.getByRole('group', { name: /Plataforma/ })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /Cuentas/ })).toBeNull()
    expect(datos(container).getAll('plataforma')).toEqual(['instagram', 'facebook'])
    rerender(<FiltrosComunes accion="/x" marcaIds={[MARCAS[0]!.id]} plataforma="facebook" />)
    expect(datos(container).getAll('plataforma')).toEqual(['facebook'])
  })

  it('sin `marcaIds` no muestra las marcas (ej.: el paso 2, donde la marca ya está fija)', () => {
    render(<FiltrosComunes accion="/x" periodo={periodo} />)
    expect(screen.queryByRole('group', { name: /Marcas/ })).toBeNull()
    expect(screen.getByLabelText(/desde/i)).toBeInTheDocument()
  })

  it('sin `plataforma` ni `periodo` no los muestra', () => {
    render(<FiltrosComunes accion="/x" marcaIds={[MARCAS[0]!.id]} />)
    expect(screen.queryByRole('group', { name: /Plataforma/ })).toBeNull()
    expect(screen.queryByLabelText(/desde/i)).toBeNull()
  })

  it('el período son dos fechas nativas con los límites de la ventana', () => {
    render(<FiltrosComunes accion="/x" marcaIds={[MARCAS[0]!.id]} periodo={periodo} />)
    const desde = screen.getByLabelText(/desde/i)
    expect(desde).toHaveAttribute('type', 'date')
    expect(desde).toHaveAttribute('name', 'desde')
    expect(desde).toHaveValue('2026-09-01')
    expect(desde).toHaveAttribute('min', '2026-07-23')
    expect(screen.getByLabelText(/hasta/i)).toHaveAttribute('max', '2026-10-20')
  })

  it('siempre hay un botón "Aplicar" (sin JS) y los extras y ocultos viajan', () => {
    const { container } = render(
      <FiltrosComunes accion="/x" marcaIds={[MARCAS[0]!.id]} ocultos={[['plan', 'p-1']]}>
        <input name="modelo" defaultValue="TRK 502" aria-label="Modelo" />
      </FiltrosComunes>,
    )
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeInTheDocument()
    expect(datos(container).get('plan')).toBe('p-1')
    expect(datos(container).get('modelo')).toBe('TRK 502')
  })
})
