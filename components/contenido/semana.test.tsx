import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

import { Semana } from './semana'
import { grupoDe, piezaVista, tandaVista } from './fixture'
import { vistaDePrueba } from '../campanas/fixture'
import { planDePrueba } from '@/lib/contenidista/fixture'

const plan = (o: Record<string, unknown> = {}) => vistaDePrueba({ id: 'p1', estado: 'aprobado', plan: planDePrueba(), ...o })
const base = { semana: 1, tanda: null, grupos: [], tandasPrevias: [], puedeEditar: true, habilitado: true }

describe('Semana (S48, S51, S53)', () => {
  it('muestra el eje, el rango de fechas y lo que pide el plan', () => {
    render(<Semana plan={plan()} {...base} />)
    expect(screen.getByRole('heading', { name: /Semana 1/ })).toBeInTheDocument()
    expect(screen.getByText(/2026-11-02 a 2026-11-08/)).toBeInTheDocument()
    expect(screen.getByText(/Lanzamiento/)).toBeInTheDocument()
    expect(screen.getByText(/Recorrido por el taller/)).toBeInTheDocument()
    expect(screen.getByText(/4 piezas/)).toBeInTheDocument()
  })

  it('con permiso ofrece el generador; sin tanda dice que no se generó', () => {
    render(<Semana plan={plan()} {...base} />)
    expect(screen.getByRole('button', { name: /Generar semana 1/ })).toBeEnabled()
    expect(screen.getByText(/Todavía no se generó/)).toBeInTheDocument()
  })

  it('lector: ni generador ni botones, solo lectura', () => {
    render(<Semana plan={plan()} {...base} puedeEditar={false} tanda={tandaVista()} grupos={[grupoDe(piezaVista())]} />)
    expect(screen.queryAllByRole('button').filter((b) => b.textContent !== 'Versiones (1)')).toEqual([])
    expect(screen.getByText('Mirá cómo nace una moto')).toBeInTheDocument()
  })

  it('una semana con más de 12 piezas deshabilita el generador y explica por qué', () => {
    const p = planDePrueba()
    p.calendario[0]!.piezas[0]!.cantidad = 10
    render(<Semana plan={plan({ plan: p })} {...base} />)
    expect(screen.getByRole('button', { name: /Generar semana 1/ })).toBeDisabled()
    expect(screen.getByText(/pide 13 piezas; el tope es 12/)).toBeInTheDocument()
  })

  it('S51 badge "plan desactualizado" si el plan ya no es el aprobado', () => {
    render(<Semana plan={plan({ estado: 'reemplazado' })} {...base} tanda={tandaVista()} grupos={[grupoDe(piezaVista())]} />)
    expect(screen.getByText('plan desactualizado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /semana 1 ·/ })).toBeDisabled()
    expect(screen.getByText(/ya no es el aprobado/)).toBeInTheDocument()
  })

  it('con el plan vigente no hay badge', () => {
    render(<Semana plan={plan()} {...base} tanda={tandaVista()} grupos={[grupoDe(piezaVista())]} />)
    expect(screen.queryByText('plan desactualizado')).not.toBeInTheDocument()
  })

  it('muestra los datos de la tanda y una tarjeta por pieza', () => {
    render(<Semana plan={plan()} {...base} tanda={tandaVista({ notas: 'Foco en financiación' })} grupos={[grupoDe(piezaVista()), grupoDe(piezaVista({ id: 'pz2', raizId: 'pz2', orden: 2 }))]} />)
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(screen.getByText(/Foco en financiación/)).toBeInTheDocument()
  })
})

describe('Semana · piezas ocultas por los filtros', () => {
  it('dice cuántas oculta, y si no queda ninguna visible no afirma que la semana está vacía', () => {
    render(<Semana plan={plan()} {...base} tanda={tandaVista()} grupos={[]} ocultas={2} />)
    expect(screen.getByText('Los filtros ocultan 2 piezas.')).toBeInTheDocument()
  })
  it('en singular y sin filtros activos no dice nada', () => {
    const { rerender } = render(<Semana plan={plan()} {...base} tanda={tandaVista()} grupos={[]} ocultas={1} />)
    expect(screen.getByText('Los filtros ocultan 1 pieza.')).toBeInTheDocument()
    rerender(<Semana plan={plan()} {...base} tanda={tandaVista()} grupos={[grupoDe(piezaVista())]} />)
    expect(screen.queryByText(/Los filtros ocultan/)).toBeNull()
  })
})
