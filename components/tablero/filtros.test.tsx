import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FiltrosTablero } from './filtros'
import { MARCAS } from '@/lib/datos/marcas'
import type { Filtros } from '@/lib/datos/filtros'

const filtros: Filtros = { marcaIds: [MARCAS[1]!.id], plataforma: 'instagram', desde: '2026-09-01', hasta: '2026-09-30' }
const limites = { minimo: '2026-07-23', maximo: '2026-10-20' }

describe('FiltrosTablero', () => {
  it('es un formulario GET hacia /tablero (sin JS)', () => {
    const { container } = render(<FiltrosTablero filtros={filtros} {...limites} />)
    const form = container.querySelector('form')!
    expect(form).toHaveAttribute('method', 'get')
    expect(form).toHaveAttribute('action', '/tablero')
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

  it('conserva marca y plataforma como campos ocultos al aplicar fechas', () => {
    const { container } = render(<FiltrosTablero filtros={filtros} {...limites} />)
    expect(container.querySelector('input[name="marca"]')).toHaveValue(MARCAS[1]!.id)
    expect(container.querySelector('input[name="plataforma"]')).toHaveValue('instagram')
    expect(screen.getByRole('button', { name: /aplicar/i })).toBeInTheDocument()
  })

  it('los toggles de plataforma son links que conservan el resto de los filtros', () => {
    render(<FiltrosTablero filtros={filtros} {...limites} />)
    const fb = new URL(screen.getByRole('link', { name: 'Facebook' }).getAttribute('href')!, 'http://x')
    expect(fb.searchParams.get('plataforma')).toBe('facebook')
    expect(fb.searchParams.get('desde')).toBe('2026-09-01')
    expect(fb.searchParams.get('marca')).toBe(MARCAS[1]!.id)
    expect(screen.getByRole('link', { name: 'Instagram' })).toHaveAttribute('aria-current', 'true')
  })

  it('los links de marca conservan fechas y plataforma', () => {
    render(<FiltrosTablero filtros={filtros} {...limites} />)
    const m = new URL(screen.getByRole('link', { name: MARCAS[3]!.nombre }).getAttribute('href')!, 'http://x')
    expect(m.searchParams.get('marca')).toBe(MARCAS[3]!.id)
    expect(m.searchParams.get('plataforma')).toBe('instagram')
    expect(m.searchParams.get('hasta')).toBe('2026-09-30')
  })

  it('aclara que la publicidad solo filtra por fechas y que lo orgánico es acumulado', () => {
    render(<FiltrosTablero filtros={filtros} {...limites} />)
    expect(screen.getByText(/Publicidad: solo filtra por fechas \(campañas sin marca\/plataforma\)/)).toBeInTheDocument()
    expect(screen.getByText(/métricas orgánicas = acumulado de vida por publicación/i)).toBeInTheDocument()
  })
})
