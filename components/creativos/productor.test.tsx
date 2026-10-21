import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { Productor } from './productor'
import { creativoDePrueba, piezaImagenDePrueba } from './fixture'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const motores = [
  { id: 'gemini-nano-banana-2.1', nombre: 'Nano Banana 2.1', porImagenUsd: 0.0336 },
  { id: 'gemini-3-pro-image', nombre: 'Gemini 3 Pro Image', porImagenUsd: 0.134 },
]
const piezas = [
  piezaImagenDePrueba({ id: 'p1' }),
  piezaImagenDePrueba({
    id: 'p2',
    raizId: 'r2',
    generaciones: [{ id: 'g1', estado: 'ok', motor: 'gemini-nano-banana-2.1', cantidad: 1, costoEstimadoUsd: 0.04, costoRealUsd: 0.03, error: null, creadoEn: '2026-10-26T12:00:00Z', interrumpida: false }],
    creativos: [creativoDePrueba({ id: 'c1' })],
  }),
]
const props = { piezas, piezaInicialId: null, puedeEditar: true, apagado: null, topeUsd: 10, gastadoUsd: 1.25, motores, motorPorDefecto: 'gemini-nano-banana-2.1' }

const estimacion = (o: Record<string, unknown> = {}) => ({
  generacion: { id: 'g9', motor: 'gemini-nano-banana-2.1', cantidad: 3, aspecto: '4:5', porImagenUsd: 0.0336, listaUsd: 0.1008, costoEstimadoUsd: 0.13005, venceEn: '2026-10-26T15:15:00Z' },
  mes: { gastadoUsd: 1.25, topeUsd: 10 },
  excedeTope: false,
  ...o,
})

beforeEach(() => router.refresh.mockClear())
afterEach(() => vi.unstubAllGlobals())

async function estimar(cantidad = '3') {
  fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: cantidad } })
  fireEvent.click(screen.getByRole('button', { name: 'Estimar' }))
  return screen.findByRole('button', { name: /Confirmar US\$/ })
}

describe('Productor: controles (S11.1, S11.5, S11.6, S11.7)', () => {
  it('S11.1 lista las piezas elegibles, los motores de imagen (el barato por defecto) y cantidad 1 a 4', () => {
    render(<Productor {...props} />)
    expect(screen.getByLabelText('Pieza').querySelectorAll('option')).toHaveLength(2)
    expect(screen.getByLabelText('Motor')).toHaveValue('gemini-nano-banana-2.1')
    expect(Array.from(screen.getByLabelText('Cantidad').querySelectorAll('option')).map((o) => o.textContent)).toEqual(['1', '2', '3', '4'])
    expect(screen.getByText(/Nano Banana 2.1 · ~US\$ 0,0336 c\/u/)).toBeInTheDocument()
  })

  it('el video figura como referencial, no disponible y no seleccionable', () => {
    render(<Productor {...props} />)
    expect(screen.getByText(/Video: referencial, no disponible/)).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /veo|runway|sora|kling/i })).toBeNull()
  })

  it('S11.5 muestra el gasto del mes contra el tope y lo que queda', () => {
    render(<Productor {...props} />)
    expect(screen.getByText(/Gastado este mes: US\$ 1,2500 de US\$ 10,0000 \(quedan US\$ 8,7500\)/)).toBeInTheDocument()
  })

  it('S11.6 el lector no ve controles de generar, confirmar ni elegir pero sí las imágenes', () => {
    render(<Productor {...props} puedeEditar={false} piezaInicialId="p2" />)
    expect(screen.queryByRole('button', { name: 'Estimar' })).toBeNull()
    expect(screen.queryByLabelText('Motor')).toBeNull()
    expect(screen.queryByLabelText('Cantidad')).toBeNull()
    expect(screen.queryByRole('button', { name: /Confirmar/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Elegir/ })).toBeNull()
    expect(screen.getAllByRole('img')).toHaveLength(1)
  })

  it('S11.7 Productor apagado: avisa el motivo y no deja estimar', () => {
    render(<Productor {...props} apagado="Sin PRESUPUESTO_MENSUAL_USD el Productor está apagado." topeUsd={null} />)
    expect(screen.getByRole('status')).toHaveTextContent('PRESUPUESTO_MENSUAL_USD')
    expect(screen.getByRole('button', { name: 'Estimar' })).toBeDisabled()
  })

  it('sin piezas aprobadas manda a Contenido', () => {
    render(<Productor {...props} piezas={[]} />)
    expect(screen.getByText(/No hay piezas aprobadas/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Contenido/ })).toHaveAttribute('href', '/contenido')
  })

  it('arranca en la pieza pedida por ?pieza=', () => {
    render(<Productor {...props} piezaInicialId="p2" />)
    expect(screen.getByLabelText('Pieza')).toHaveValue('p2')
  })
})

describe('Productor: la compuerta (S11.2, S11.3)', () => {
  it('Estimar manda solo pieza, motor y cantidad; Confirmar no existe antes de estimar; no llama a confirmar', async () => {
    const f = vi.fn(async () => json(estimacion(), 201))
    vi.stubGlobal('fetch', f)
    render(<Productor {...props} />)
    expect(screen.queryByRole('button', { name: /Confirmar/ })).toBeNull()
    await estimar('3')
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/generaciones')
    expect(JSON.parse(String(init.body))).toEqual({ piezaId: 'p1', motor: 'gemini-nano-banana-2.1', cantidad: 3 })
  })

  it('S11.2 muestra la estimación del servidor y el botón con ese monto', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(estimacion(), 201)))
    render(<Productor {...props} />)
    const boton = await estimar()
    expect(boton).toHaveTextContent('Confirmar US$ 0,13005')
    expect(boton).toBeEnabled()
    expect(screen.getByText(/precio de lista US\$ 0,1008/)).toBeInTheDocument()
  })

  it('cambiar motor, cantidad o pieza descarta la estimación (hay que estimar de nuevo)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(estimacion(), 201)))
    render(<Productor {...props} />)
    await estimar()
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '2' } })
    expect(screen.queryByRole('button', { name: /Confirmar/ })).toBeNull()
  })

  it('S11.3 el doble click confirma UNA sola vez y el botón queda deshabilitado mientras corre', async () => {
    let terminar!: (r: Response) => void
    const f = vi.fn(async (url: string) =>
      url === '/api/generaciones' ? json(estimacion(), 201) : new Promise<Response>((r) => (terminar = r)),
    )
    vi.stubGlobal('fetch', f)
    render(<Productor {...props} />)
    const boton = await estimar()
    fireEvent.click(boton)
    fireEvent.click(boton)
    await waitFor(() => expect(screen.getByRole('button', { name: /Generando/ })).toBeDisabled())
    expect(f.mock.calls.filter(([u]) => String(u).includes('/confirmar'))).toHaveLength(1)
    expect(f.mock.calls.find(([u]) => String(u).includes('/confirmar'))![0]).toBe('/api/generaciones/g9/confirmar')
    terminar(json({ generacion: { id: 'g9', estado: 'ok', costoRealUsd: 0.1, costoEstimadoUsd: 0.13005, error: null }, creativos: [] }))
    await waitFor(() => expect(router.refresh).toHaveBeenCalled())
    expect(screen.getByText(/Costo real: US\$ 0,1000/)).toBeInTheDocument()
    // Tras el primer click no vuelve a poder confirmarse esa misma estimación.
    expect(screen.queryByRole('button', { name: /Confirmar/ })).toBeNull()
  })

  it('si la estimación excede el tope el botón queda deshabilitado y lo explica', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(estimacion({ excedeTope: true, mes: { gastadoUsd: 9.95, topeUsd: 10 } }), 201)))
    render(<Productor {...props} />)
    const boton = await estimar()
    expect(boton).toBeDisabled()
    expect(screen.getByText(/supera el tope mensual/i)).toBeInTheDocument()
  })

  it('402 muestra lo que queda del tope y deshabilita la confirmación', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url === '/api/generaciones' ? json(estimacion(), 201) : json({ error: 'Supera el tope mensual.', topeUsd: 10, gastadoUsd: 9.95, restanteUsd: 0.05 }, 402),
    ))
    render(<Productor {...props} />)
    fireEvent.click(await estimar())
    expect(await screen.findByRole('alert')).toHaveTextContent(/quedan US\$ 0,0500 de US\$ 10,0000/)
    expect(router.refresh).not.toHaveBeenCalled()
  })

  it('410 pide estimar de nuevo y descarta la estimación', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url === '/api/generaciones' ? json(estimacion(), 201) : json({ error: 'La estimación venció: estimá de nuevo.' }, 410),
    ))
    render(<Productor {...props} />)
    fireEvent.click(await estimar())
    expect(await screen.findByRole('alert')).toHaveTextContent(/estimá de nuevo/i)
    expect(screen.queryByRole('button', { name: /Confirmar/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Estimar' })).toBeEnabled()
  })

  it('409 avisa que ya se confirmó y refresca para ver el resultado', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url === '/api/generaciones' ? json(estimacion(), 201) : json({ error: 'Ya se confirmó: no se vuelve a cobrar.' }, 409),
    ))
    render(<Productor {...props} />)
    fireEvent.click(await estimar())
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya se confirmó')
    await waitFor(() => expect(router.refresh).toHaveBeenCalled())
  })

  it('un error al estimar se muestra y no deja ninguna estimación', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Solo se generan imágenes de piezas aprobadas.' }, 422)))
    render(<Productor {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Estimar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('aprobadas')
    expect(screen.queryByRole('button', { name: /Confirmar/ })).toBeNull()
  })
})
