import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TextosCopiaFiel } from './textos-copia'
import { resolverDiseno } from '@/lib/promocion/diseno/defaults'
import { datosDePrueba } from '@/lib/promocion/fixture'
import type { Diseno } from '@/lib/promocion/diseno/tipos'

const resuelto = (d: Diseno | null = null) => resolverDiseno(d, 'impactante_textura', { modelo: 'ROUSER 200', titular: 'Tu próxima moto', datos: datosDePrueba() })
const fijos = { modelo: 'ROUSER 200', precio: '$ 4.500.000', lugar: 'Quilmes' }
const valores = { frase: 'Tu próxima moto', condicionTexto: '12 CUOTAS', condicionDestacado: 'SIN INTERÉS' }
const montar = (o: { d?: Diseno | null; deshabilitado?: boolean; onCambiar?: (c: Diseno) => void; onEscribir?: (c: any, x: string) => void } = {}) =>
  render(<TextosCopiaFiel resuelto={resuelto(o.d ?? null)} valores={valores} onEscribir={o.onEscribir ?? (() => {})} onBlur={() => {}} indicador={() => null} onCambiar={o.onCambiar ?? (() => {})} deshabilitado={o.deshabilitado ?? false} fijos={fijos} lineaPedida="ROUSER 200 · $ 4.500.000 · 12 CUOTAS SIN INTERÉS · Tu próxima moto · Consultanos · Quilmes" />)

describe('<TextosCopiaFiel>', () => {
  it('muestra el modelo, el precio y el lugar de solo lectura, y la línea que se le pide a la IA', () => {
    montar()
    expect(screen.getByText('ROUSER 200', { selector: 'dd' })).toBeInTheDocument()
    expect(screen.getByText('$ 4.500.000', { selector: 'dd' })).toBeInTheDocument()
    expect(screen.getByTestId('linea-pedida')).toHaveTextContent('ROUSER 200 · $ 4.500.000 · 12 CUOTAS SIN INTERÉS · Tu próxima moto · Consultanos · Quilmes')
  })
  it('la frase, la condición y el botón se escriben y se guardan por el camino de siempre', () => {
    const onCambiar = vi.fn()
    const onEscribir = vi.fn()
    montar({ onCambiar, onEscribir })
    fireEvent.change(screen.getByRole('textbox', { name: 'Frase' }), { target: { value: 'Rompé la rutina' } })
    expect(onEscribir).toHaveBeenCalledWith('frase', 'Rompé la rutina')
    fireEvent.change(screen.getByLabelText('Botón (llamado a la acción)'), { target: { value: 'Vení a verla' } })
    expect(onCambiar).toHaveBeenCalledWith({ cta: 'Vení a verla' })
  })
  it('destildar un elemento lo saca y deshabilita su campo', () => {
    const onCambiar = vi.fn()
    const { unmount } = montar({ onCambiar })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Precio' }))
    expect(onCambiar).toHaveBeenCalledWith({ ocultos: ['precio'] })
    unmount()
    montar({ d: { ocultos: ['frase', 'cta'] } })
    expect(screen.getByRole('textbox', { name: 'Frase' })).toBeDisabled()
    expect(screen.getByLabelText('Botón (llamado a la acción)')).toBeDisabled()
  })
  it('deshabilitado no deja tocar nada', () => {
    montar({ deshabilitado: true })
    expect(screen.getByRole('textbox', { name: 'Frase' })).toBeDisabled()
    for (const c of screen.getAllByRole('checkbox')) expect(c).toBeDisabled()
  })
  it('con todo sacado dice que la imagen va sin textos', () => {
    render(<TextosCopiaFiel resuelto={resuelto({ ocultos: ['modelo', 'frase', 'precio', 'condicion', 'cta', 'lugar'] })} valores={valores} onEscribir={() => {}} onBlur={() => {}} indicador={() => null} onCambiar={() => {}} deshabilitado={false} fijos={fijos} lineaPedida="" />)
    expect(screen.getByTestId('linea-pedida')).toHaveTextContent('nada (la imagen va sin textos)')
  })
})
