import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MotosDeLaPlaca } from './paso-datos-varias-lectura'
import { vistaDePromocion } from '@/lib/promocion/vista'
import { filaPromocion } from '@/lib/promocion/fixture'
import type { DetallePromocion } from '@/lib/promocion/pantalla'

const promo = vistaDePromocion(filaPromocion({ id: 'p1', copy: null, motos_extra: [{ fotoId: 'f2', modelo: 'LEONCINO 500', precio: { moneda: 'ARS', monto: 7_000_000 }, promo: { tipo: 'ninguna', detalle: '' } }] } as never))
const motos: NonNullable<DetallePromocion['motos']> = [
  { fotoId: 'f1', modelo: 'TRK 502', precio: '$ 4.500.000', condicion: '12 cuotas sin interés', url: 'https://x/f1.jpg', borrada: false },
  { fotoId: 'f2', modelo: 'LEONCINO 500', precio: '$ 7.000.000', condicion: '', url: null, borrada: true },
]

describe('<MotosDeLaPlaca> · el paso 1 de una placa de varias motos', () => {
  it('muestra cada moto con su foto, su modelo, su precio y su condición, y no tiene ningún campo para editar', () => {
    render(<MotosDeLaPlaca promocion={promo} marca="Benelli Store Quilmes" motos={motos} />)
    const lista = screen.getByRole('list', { name: 'Motos de la placa' })
    const items = within(lista).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Moto 1')
    expect(items[0]).toHaveTextContent('TRK 502')
    expect(items[0]).toHaveTextContent('$ 4.500.000')
    expect(items[0]).toHaveTextContent('12 cuotas sin interés')
    expect(within(items[0]!).getByRole('img', { name: /Moto 1/ })).toHaveAttribute('src', 'https://x/f1.jpg')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /Guardar/ })).toBeNull()
  })
  it('una foto que se borró lo dice', () => {
    render(<MotosDeLaPlaca promocion={promo} marca="Benelli" motos={motos} />)
    expect(screen.getByText(/La foto de esta moto se borró/)).toBeInTheDocument()
  })
  it('explica que las motos no se cambian y ofrece armar otra placa', () => {
    render(<MotosDeLaPlaca promocion={promo} marca="Benelli" motos={motos} />)
    expect(screen.getByText(/no se cambian/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /otra placa/i })).toHaveAttribute('href', '/promocionar/nueva?que=varias')
  })
})
