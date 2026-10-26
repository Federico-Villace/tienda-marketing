import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FiltrosTablero } from './filtros'
import { MARCAS } from '@/lib/datos/marcas'
import type { Filtros } from '@/lib/datos/filtros'

const filtros: Filtros = { marcaIds: [MARCAS[1]!.id, MARCAS[3]!.id], plataforma: 'instagram', desde: '2026-09-01', hasta: '2026-09-30' }
const limites = { minimo: '2026-07-23', maximo: '2026-10-20' }
const datos = (c: HTMLElement) => new FormData(c.querySelector('form')!)

describe('FiltrosTablero', () => {
  it('es UN formulario GET hacia /tablero (funciona sin JS)', () => {
    const { container } = render(<FiltrosTablero filtros={filtros} {...limites} />)
    expect(container.querySelectorAll('form')).toHaveLength(1)
    const form = container.querySelector('form')!
    expect(form).toHaveAttribute('action', '/tablero')
    expect(form.getAttribute('method') ?? 'get').toBe('get')
  })

  it('las marcas son checkboxes con name "marca": las elegidas viajan repetidas', () => {
    const { container } = render(<FiltrosTablero filtros={filtros} {...limites} />)
    expect(screen.getByRole('group', { name: /Marcas/ })).toBeInTheDocument()
    expect(screen.getByText(/2 de 7/)).toBeInTheDocument()
    expect(datos(container).getAll('marca')).toEqual([MARCAS[1]!.id, MARCAS[3]!.id])
    expect(screen.getByLabelText(MARCAS[1]!.nombre)).toBeChecked()
    expect(screen.getByLabelText(MARCAS[0]!.nombre)).not.toBeChecked()
  })

  it('la plataforma es Instagram y Facebook; "todas" tiene las dos marcadas', () => {
    const { container, rerender } = render(<FiltrosTablero filtros={filtros} {...limites} />)
    expect(datos(container).getAll('plataforma')).toEqual(['instagram'])
    rerender(<FiltrosTablero filtros={{ ...filtros, plataforma: 'todas' }} {...limites} />)
    expect(datos(container).getAll('plataforma')).toEqual(['instagram', 'facebook'])
    expect(screen.getByRole('group', { name: /Plataforma/ })).toBeInTheDocument()
  })

  it('cambiar marca o cuenta envía el formulario solo (auto-envío), y las fechas se aplican con el botón', () => {
    render(<FiltrosTablero filtros={filtros} {...limites} />)
    expect(screen.getByRole('button', { name: /aplicar/i })).toBeInTheDocument()
  })

  it('tiene dos fechas nativas con los valores y los límites de la ventana', () => {
    render(<FiltrosTablero filtros={filtros} {...limites} />)
    const desde = screen.getByLabelText(/desde/i)
    const hasta = screen.getByLabelText(/hasta/i)
    expect(desde).toHaveAttribute('type', 'date')
    expect(desde).toHaveAttribute('name', 'desde')
    expect(desde).toHaveValue('2026-09-01')
    expect(hasta).toHaveAttribute('name', 'hasta')
    expect(hasta).toHaveValue('2026-09-30')
    for (const i of [desde, hasta]) {
      expect(i).toHaveAttribute('min', '2026-07-23')
      expect(i).toHaveAttribute('max', '2026-10-20')
    }
  })

  it('no quedan campos ocultos duplicados de marca ni de plataforma', () => {
    const { container } = render(<FiltrosTablero filtros={filtros} {...limites} />)
    expect(container.querySelectorAll('input[type="hidden"]')).toHaveLength(0)
  })

  it('aclara que la publicidad solo filtra por fechas y que lo orgánico es acumulado', () => {
    render(<FiltrosTablero filtros={filtros} {...limites} />)
    expect(screen.getByText(/Publicidad: solo filtra por fechas \(campañas sin marca\/plataforma\)/)).toBeInTheDocument()
    expect(screen.getByText(/métricas orgánicas = acumulado de vida por publicación/i)).toBeInTheDocument()
  })
})
