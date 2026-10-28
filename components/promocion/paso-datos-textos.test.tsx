import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { PasoDatosTextos } from './paso-datos-textos'
import { MARCAS } from '@/lib/datos/marcas'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const fotos = [{ id: 'foto-1', ancho: 1500, alto: 1200, creadoEn: '2026-10-25T10:00:00+00:00', url: 'https://x/f1.jpg' }]

function red(o: { tanda?: () => Response } = {}) {
  const f = vi.fn(async (u: RequestInfo | URL) => {
    if (String(u) === '/api/tandas') return (o.tanda ?? (() => json({ tanda: { id: 'T5', tipo: 'textos' }, promociones: [] }, 201)))()
    throw new Error(`URL inesperada ${String(u)}`)
  })
  vi.stubGlobal('fetch', f)
  return f
}
beforeEach(() => router.push.mockClear())
afterEach(() => vi.unstubAllGlobals())

const montar = (puedeEditar = true) => render(<PasoDatosTextos fotos={fotos} puedeEditar={puedeEditar} />)
const variante = (n: number) => screen.getByRole('group', { name: `Texto ${n}` })
const base = () => {
  fireEvent.click(screen.getByRole('radio', { name: MARCAS[3]!.nombre }))
  fireEvent.change(screen.getByLabelText('Modelo'), { target: { value: 'TRK 502' } })
  fireEvent.change(screen.getByLabelText('Precio de la moto'), { target: { value: '4500000' } })
  fireEvent.click(screen.getByRole('radio', { name: /Foto subida el/ }))
}
const titular = (n: number, t: string) => fireEvent.change(within(variante(n)).getByLabelText('Titular'), { target: { value: t } })
const crear = () => screen.getByRole('button', { name: /Crear/ })

describe('<PasoDatosTextos>', () => {
  it('arranca con 2 textos, una marca a elegir y Crear deshabilitado', () => {
    montar()
    expect(screen.getByRole('heading', { name: '¿Qué textos querés probar?' })).toBeInTheDocument()
    expect(screen.getAllByRole('group', { name: /^Texto \d+$/ })).toHaveLength(2)
    expect(screen.getAllByRole('radio', { name: /Quilmes|999motos/ })).toHaveLength(MARCAS.length)
    expect(crear()).toBeDisabled()
  })

  it('se agregan textos hasta 5 y se quitan hasta dejar 2; dice cuántas placas salen', () => {
    montar()
    expect(screen.getByText('Se van a armar 2 placas: una por texto, sobre una sola imagen.')).toBeInTheDocument()
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: '+ Agregar texto' }))
    expect(screen.getAllByRole('group', { name: /^Texto \d+$/ })).toHaveLength(5)
    expect(screen.getByRole('button', { name: '+ Agregar texto' })).toBeDisabled()
    expect(screen.getByText('Se van a armar 5 placas: una por texto, sobre una sola imagen.')).toBeInTheDocument()
    for (let i = 0; i < 3; i++) fireEvent.click(within(variante(2)).getByRole('button', { name: /Quitar el texto/ }))
    expect(screen.getAllByRole('group', { name: /^Texto \d+$/ })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /Quitar el texto/ })).toBeNull()
  })

  it('el titular no lleva números: lo dice y no deja crear', () => {
    montar()
    base()
    titular(1, 'Salí a la ruta')
    titular(2, 'Solo 4500')
    expect(within(variante(2)).getByText('El titular no lleva precios ni números: el precio va aparte.')).toBeInTheDocument()
    expect(crear()).toBeDisabled()
  })

  it('dos textos iguales: lo avisa y no deja crear', () => {
    montar()
    base()
    titular(1, 'Salí a la ruta')
    titular(2, 'Salí a la ruta')
    expect(screen.getByText('Los textos 1 y 2 son iguales: cambiá el titular, la línea extra o el precio.')).toBeInTheDocument()
    expect(crear()).toBeDisabled()
    titular(2, 'Hot Sale')
    expect(crear()).toBeEnabled()
  })

  it('crea el lote: manda solo lo que cada texto cambia (línea extra y precio propios si los hay) y va a la tanda', async () => {
    const f = red()
    montar()
    base()
    titular(1, 'Salí a la ruta')
    titular(2, 'Hot Sale')
    fireEvent.change(within(variante(2)).getByLabelText('Línea extra (opcional)'), { target: { value: 'Solo este fin de semana' } })
    fireEvent.change(within(variante(2)).getByLabelText('Precio propio (opcional)'), { target: { value: '4200000' } })
    fireEvent.click(crear())
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/promocionar/tanda/T5'))
    const [, init] = (f.mock.calls as unknown as [string, RequestInit][]).find(([u]) => u === '/api/tandas')!
    expect(JSON.parse(String(init.body))).toEqual({
      tipo: 'textos',
      marcaIds: [MARCAS[3]!.id],
      fotoId: 'foto-1',
      modelo: 'TRK 502',
      aspecto: '4:5',
      lugar: 'Quilmes',
      indicaciones: '',
      precio: { moneda: 'ARS', monto: 4500000 },
      promo: { tipo: 'contado', detalle: '' },
      variantes: [{ titular: 'Salí a la ruta' }, { titular: 'Hot Sale', lineaExtra: 'Solo este fin de semana', precio: { moneda: 'ARS', monto: 4200000 } }],
    })
  })

  it('los errores del servidor se muestran y no navega', async () => {
    red({ tanda: () => json({ error: 'Revisá los datos del lote.', errores: ['Variante 2: El titular no puede llevar emojis.'] }, 400) })
    montar()
    base()
    titular(1, 'Uno')
    titular(2, 'Dos')
    fireEvent.click(crear())
    expect(await screen.findByRole('alert')).toHaveTextContent('Variante 2: El titular no puede llevar emojis.')
    expect(router.push).not.toHaveBeenCalled()
  })

  it('un lector no ve el botón de crear', () => {
    montar(false)
    expect(screen.queryByRole('button', { name: /Crear/ })).toBeNull()
  })
})
