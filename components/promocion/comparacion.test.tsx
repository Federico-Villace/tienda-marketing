import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ComparacionMarcas } from './comparacion'
import { MARCAS } from '@/lib/datos/marcas'

const fila = (o = {}) => ({ marca: 'Zontes Quilmes', modelo: 'TRK 502', publicaciones: 12, vistasPromedio: 1234.6, tasaInteraccionPct: 7.5, mencionanModelo: 3, gastoAtribuido: 50000, ...o })
const periodo = { desde: '2026-09-01', hasta: '2026-09-30', minimo: '2026-07-23', maximo: '2026-10-20' }
const props = (o = {}) => ({ periodo, accion: '/promocionar/tanda/t1', marcaIds: [MARCAS[2]!.id, MARCAS[5]!.id], modelos: ['TRK 502'], filas: [fila()], ...o })

describe('<ComparacionMarcas>', () => {
  it('es gratis y lo dice; es un formulario GET a la misma pantalla', () => {
    const { container } = render(<ComparacionMarcas {...props()} />)
    expect(screen.getByText(/gratis/i)).toBeInTheDocument()
    expect(container.querySelector('form')).toHaveAttribute('action', '/promocionar/tanda/t1')
  })
  it('el período es el mismo control que el tablero (Desde/Hasta + Aplicar), no más 90 días fijos', () => {
    render(<ComparacionMarcas {...props()} />)
    expect(screen.getByLabelText(/desde/i)).toHaveValue('2026-09-01')
    expect(screen.getByLabelText(/hasta/i)).toHaveValue('2026-09-30')
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeInTheDocument()
  })
  it('las marcas viajan como "marca" (igual que /tablero) y los modelos como "modelo" (hasta 3)', () => {
    const { container } = render(<ComparacionMarcas {...props()} />)
    const datos = new FormData(container.querySelector('form')!)
    expect(datos.getAll('marca')).toEqual([MARCAS[2]!.id, MARCAS[5]!.id])
    expect(container.querySelectorAll('input[name="modelo"]')).toHaveLength(3)
    expect(datos.getAll('modelo')[0]).toBe('TRK 502')
  })
  it('una fila por marca × modelo con cifras formateadas; sin tasa es un guion', () => {
    render(<ComparacionMarcas {...props({ filas: [fila(), fila({ marca: 'Suzuki Quilmes', tasaInteraccionPct: null })] })} />)
    const filas = within(screen.getByRole('table', { name: 'Comparación entre marcas' })).getAllByRole('row').slice(1)
    expect(filas).toHaveLength(2)
    expect(filas[0]).toHaveTextContent('1.235')
    expect(filas[0]).toHaveTextContent('7,5%')
    expect(filas[1]).toHaveTextContent('—')
  })
  it('aclara que el gasto es aproximado (sale del nombre de la campaña)', () => {
    render(<ComparacionMarcas {...props()} />)
    expect(screen.getByText(/nombre de la campaña/)).toBeInTheDocument()
  })
  it('sin filas lo dice; con fallo muestra el error sin romper', () => {
    const { rerender } = render(<ComparacionMarcas {...props({ filas: [] })} />)
    expect(screen.getByText(/Elegí al menos dos marcas/)).toBeInTheDocument()
    rerender(<ComparacionMarcas {...props({ filas: [], fallo: 'Supabase 500' })} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Supabase 500')
  })
})
