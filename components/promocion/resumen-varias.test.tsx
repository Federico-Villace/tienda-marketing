import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { ResumenPromocion } from './resumen-promocion'
import { PasoFinal } from './paso-final'
import { vistaDePromocion } from '@/lib/promocion/vista'
import { copyDePrueba, filaPromocion } from '@/lib/promocion/fixture'

const extras = [
  { fotoId: 'f2', modelo: 'LEONCINO 500', precio: { moneda: 'ARS' as const, monto: 7_000_000 }, promo: { tipo: 'cuotas' as const, detalle: '24 cuotas fijas' } },
  { fotoId: 'f3', modelo: 'TRK 502', precio: { moneda: 'USD' as const, monto: 5990 }, promo: { tipo: 'ninguna' as const, detalle: '' } },
]
const varias = vistaDePromocion(filaPromocion({ id: 'p1', copy: copyDePrueba(), motos_extra: extras } as never))
const una = vistaDePromocion(filaPromocion({ id: 'p1', copy: copyDePrueba() } as never))
const fuentes = { titulo: 'Anton', texto: 'Inter' }

beforeEach(() => router.refresh.mockClear())

describe('<ResumenPromocion> con varias motos', () => {
  it('lista cada moto con su precio y su promo, la principal primero', () => {
    render(<ResumenPromocion promocion={varias} marca="Benelli" escenaUrl={null} placaUrl={null} fuentes={fuentes} />)
    const items = within(screen.getByRole('list', { name: 'Motos de la placa' })).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('TRK 502')
    expect(items[0]).toHaveTextContent('$ 4.500.000')
    expect(items[1]).toHaveTextContent('LEONCINO 500')
    expect(items[1]).toHaveTextContent('$ 7.000.000')
    expect(items[1]).toHaveTextContent('24 cuotas fijas')
    expect(items[2]).toHaveTextContent('US$ 5.990')
  })
  it('una moto sola se ve como siempre', () => {
    render(<ResumenPromocion promocion={una} marca="Benelli" escenaUrl={null} placaUrl={null} fuentes={fuentes} />)
    expect(screen.queryByRole('list', { name: 'Motos de la placa' })).toBeNull()
    expect(screen.getByText('Moto')).toBeInTheDocument()
  })
})

describe('<PasoFinal> con la grilla de motos', () => {
  const grilla = { ...varias, estado: 'aprobada' as const, plantilla: 'varias_motos' }
  it('ofrece bajarla en los tres formatos (gratis)', () => {
    render(<PasoFinal promocion={grilla} placa={{ url: 'https://x/p.png', descarga: 'https://x/p.png?download=1' }} puedeEditar />)
    expect(screen.getByTestId('botones-formatos')).toBeInTheDocument()
  })
  it('el lector no ve los formatos', () => {
    render(<PasoFinal promocion={grilla} placa={{ url: 'https://x/p.png', descarga: 'https://x/p.png?download=1' }} puedeEditar={false} />)
    expect(screen.queryByTestId('botones-formatos')).toBeNull()
  })
})
