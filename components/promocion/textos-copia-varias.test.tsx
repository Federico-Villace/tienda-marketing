import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { TextosCopiaFielVarias } from './textos-copia'
import { resolverDiseno } from '@/lib/promocion/diseno/defaults'
import { datosDePrueba } from '@/lib/promocion/fixture'
import type { Diseno } from '@/lib/promocion/diseno/tipos'

const resuelto = (d: Diseno | null = null) => resolverDiseno(d, 'impactante_textura', { modelo: 'ROUSER 200', titular: 'Elegí la tuya', datos: datosDePrueba() })
const motos = [
  { modelo: 'ROUSER 200', precio: '$ 4.500.000', condicion: '12 CUOTAS SIN INTERÉS' },
  { modelo: 'LEONCINO 500', precio: '$ 7.000.000', condicion: '' },
  { modelo: 'TRK 502', precio: '$ 9.200.000', condicion: 'CONTADO' },
]
const montar = (o: { d?: Diseno | null; deshabilitado?: boolean; onCambiar?: (c: Diseno) => void; onEscribir?: (x: string) => void } = {}) =>
  render(
    <TextosCopiaFielVarias
      resuelto={resuelto(o.d ?? null)}
      motos={motos}
      lugar="Quilmes"
      frase="Elegí la tuya"
      onEscribirFrase={o.onEscribir ?? (() => {})}
      onBlur={() => {}}
      indicador={null}
      onCambiar={o.onCambiar ?? (() => {})}
      deshabilitado={o.deshabilitado ?? false}
      lineaPedida="ROUSER 200 · $ 4.500.000 · …"
    />,
  )

describe('<TextosCopiaFielVarias>', () => {
  it('lista CADA moto con su modelo, su precio y su condición, solo lectura, en orden', () => {
    montar()
    const items = within(screen.getByRole('list', { name: 'Motos de la placa' })).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Moto 1')
    expect(items[0]).toHaveTextContent('ROUSER 200')
    expect(items[0]).toHaveTextContent('$ 4.500.000')
    expect(items[0]).toHaveTextContent('12 CUOTAS SIN INTERÉS')
    expect(items[1]).toHaveTextContent('LEONCINO 500')
    expect(items[1]).toHaveTextContent('$ 7.000.000')
    expect(items[2]).toHaveTextContent('CONTADO')
  })
  it('las motos no se editan acá: no hay campos de modelo, precio ni condición', () => {
    montar()
    expect(screen.queryByLabelText(/Condición/)).toBeNull()
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
  })
  it('la frase y el botón se guardan por el camino de siempre', () => {
    const onCambiar = vi.fn()
    const onEscribir = vi.fn()
    montar({ onCambiar, onEscribir })
    fireEvent.change(screen.getByRole('textbox', { name: 'Frase' }), { target: { value: 'Rompé la rutina' } })
    expect(onEscribir).toHaveBeenCalledWith('Rompé la rutina')
    fireEvent.change(screen.getByLabelText('Botón (llamado a la acción)'), { target: { value: 'Vení a verla' } })
    expect(onCambiar).toHaveBeenCalledWith({ cta: 'Vení a verla' })
  })
  it('destildar Precio lo saca de TODAS las motos', () => {
    const onCambiar = vi.fn()
    montar({ onCambiar })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Precio' }))
    expect(onCambiar).toHaveBeenCalledWith({ ocultos: ['precio'] })
  })
  it('lo sacado se ve apagado en la lista', () => {
    montar({ d: { ocultos: ['precio'] } })
    expect(screen.getByRole('list', { name: 'Motos de la placa' }).querySelector('[data-sacado="precio"]')).not.toBeNull()
  })
  it('el lector (deshabilitado) no puede tocar nada', () => {
    montar({ deshabilitado: true })
    expect(screen.getByRole('textbox', { name: 'Frase' })).toBeDisabled()
    for (const c of screen.getAllByRole('checkbox')) expect(c).toBeDisabled()
    expect(screen.getByLabelText('Botón (llamado a la acción)')).toBeDisabled()
  })
  it('explica que cambiar las motos es crear otra promoción', () => {
    montar()
    expect(screen.getByText(/no se cambian/i)).toBeInTheDocument()
  })
})
