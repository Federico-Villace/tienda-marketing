import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { menuConPrecios } from '@/lib/productor/ediciones'
import { MenuFoto } from './menu-foto'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const motores = [
  { id: 'gemini-nano-banana-2.1', nombre: 'Nano Banana 2.1', porImagenUsd: 0.0336 },
  { id: 'gemini-3-pro-image', nombre: 'Gemini 3 Pro Image', porImagenUsd: 0.134 },
]
const menuPorMotor = {
  'gemini-nano-banana-2.1': menuConPrecios('gemini-nano-banana-2.1', 1),
  'gemini-3-pro-image': menuConPrecios('gemini-3-pro-image', 1),
}
const foto = { id: 'f1', ancho: 1536, alto: 2048, creadoEn: '2026-10-27T09:00:00Z', url: 'https://x/f1.jpg', generaciones: [], creativos: [] }
const props = { foto, puedeEditar: true, apagado: null, topeUsd: 10, gastadoUsd: 1.25, motores, motorPorDefecto: 'gemini-nano-banana-2.1', menuPorMotor }

const estimacion = (o: Record<string, unknown> = {}) => ({
  generacion: { id: 'g9', motor: 'gemini-nano-banana-2.1', cantidad: 2, aspecto: '4:5', edicion: 'fondo_estudio', porImagenUsd: 0.0336, listaUsd: 0.0672, costoEstimadoUsd: 0.09006, venceEn: '2026-10-27T15:15:00Z' },
  mes: { gastadoUsd: 1.25, topeUsd: 10 },
  excedeTope: false,
  ...o,
})

beforeEach(() => router.refresh.mockClear())
afterEach(() => vi.unstubAllGlobals())

async function estimar() {
  fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: 'Estimar' }))
  return screen.findByRole('button', { name: /Confirmar US\$/ })
}

describe('MenuFoto: menú con precios (F13)', () => {
  it('lista las cinco ediciones, cada una con su precio por imagen', () => {
    render(<MenuFoto {...props} />)
    expect(screen.getAllByRole('radio')).toHaveLength(5)
    expect(screen.getByLabelText(/Fondo de estudio/)).toBeChecked()
    expect(screen.getAllByText(/hasta US\$ 0,04503 por imagen/)).toHaveLength(5)
  })

  it('ofrece los aspectos con sus etiquetas, los motores y la cantidad 1 a 4', () => {
    render(<MenuFoto {...props} />)
    expect(Array.from(screen.getByLabelText('Formato').querySelectorAll('option')).map((o) => o.textContent)).toEqual([
      'Feed cuadrado (1:1)', 'Feed vertical (4:5)', 'Historia (9:16)',
    ])
    expect(screen.getByLabelText('Motor')).toHaveValue('gemini-nano-banana-2.1')
    expect(Array.from(screen.getByLabelText('Cantidad').querySelectorAll('option')).map((o) => o.textContent)).toEqual(['1', '2', '3', '4'])
  })

  it('cambiar de motor cambia el precio mostrado (la entrada de Pro pesa menos)', () => {
    render(<MenuFoto {...props} />)
    fireEvent.change(screen.getByLabelText('Motor'), { target: { value: 'gemini-3-pro-image' } })
    expect(screen.getAllByText(/hasta US\$ 0,18612 por imagen/)).toHaveLength(5)
  })

  it('el lector ve el menú pero sin controles ni Estimar', () => {
    render(<MenuFoto {...props} puedeEditar={false} />)
    expect(screen.queryByRole('button', { name: 'Estimar' })).toBeNull()
    expect(screen.queryByLabelText('Motor')).toBeNull()
    expect(screen.getAllByText(/hasta US\$/).length).toBeGreaterThan(0)
  })

  it('apagado: avisa el motivo y no deja estimar', () => {
    render(<MenuFoto {...props} apagado="Falta GEMINI_API_KEY: el Productor está deshabilitado." />)
    expect(screen.getByRole('status')).toHaveTextContent('GEMINI_API_KEY')
    expect(screen.getByRole('button', { name: 'Estimar' })).toBeDisabled()
  })
})

describe('MenuFoto: la compuerta', () => {
  it('estima sin precio en el body y NO confirma solo: hay que hacer click en Confirmar US$ X', async () => {
    const f = vi.fn(async () => json(estimacion(), 201))
    vi.stubGlobal('fetch', f)
    render(<MenuFoto {...props} />)
    fireEvent.click(screen.getByLabelText(/Escenario urbano/))
    fireEvent.change(screen.getByLabelText('Formato'), { target: { value: '9:16' } })
    const confirmar = await estimar()
    expect(confirmar).toHaveTextContent('Confirmar US$ 0,09006')
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/generaciones')
    expect(JSON.parse(String(init.body))).toEqual({ fotoId: 'f1', edicion: 'escenario_urbano', aspecto: '9:16', motor: 'gemini-nano-banana-2.1', cantidad: 2 })
  })

  it('confirmar llama al endpoint de la generación, muestra el costo real y refresca', async () => {
    const f = vi.fn(async (u: string) =>
      u === '/api/generaciones' ? json(estimacion(), 201) : json({ generacion: { id: 'g9', estado: 'ok', costoRealUsd: 0.0708, costoEstimadoUsd: 0.09006, error: null }, creativos: [] }),
    )
    vi.stubGlobal('fetch', f)
    render(<MenuFoto {...props} />)
    fireEvent.click(await estimar())
    expect(await screen.findByText(/Costo real: US\$ 0,0708/)).toBeInTheDocument()
    expect(f.mock.calls[1]![0]).toBe('/api/generaciones/g9/confirmar')
    expect(router.refresh).toHaveBeenCalled()
  })

  it('si la estimación excede el tope, Confirmar queda deshabilitado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(estimacion({ excedeTope: true }), 201)))
    render(<MenuFoto {...props} />)
    expect(await estimar()).toBeDisabled()
    expect(screen.getByText(/supera el tope mensual/i)).toBeInTheDocument()
  })

  it('doble click en Confirmar: una sola request', async () => {
    let resolver!: (r: Response) => void
    const f = vi.fn((u: string) => (u === '/api/generaciones' ? Promise.resolve(json(estimacion(), 201)) : new Promise<Response>((r) => (resolver = r))))
    vi.stubGlobal('fetch', f)
    render(<MenuFoto {...props} />)
    const c = await estimar()
    fireEvent.click(c)
    fireEvent.click(c)
    expect(f.mock.calls.filter((x) => String(x[0]).includes('confirmar'))).toHaveLength(1)
    resolver(json({ generacion: { id: 'g9', estado: 'ok', costoRealUsd: 0.07, costoEstimadoUsd: 0.09, error: null }, creativos: [] }))
    await waitFor(() => expect(router.refresh).toHaveBeenCalled())
  })

  it.each([
    [402, { error: 'Supera el tope mensual.', restanteUsd: 0.05, topeUsd: 10 }, /quedan US\$ 0,0500 de US\$ 10,0000/],
    [409, { error: 'Ya se confirmó: no se vuelve a cobrar.' }, /Ya se confirmó/],
    [410, { error: 'La estimación venció: estimá de nuevo.' }, /venció/],
    [503, { error: 'Falta GEMINI_API_KEY: el Productor está deshabilitado.' }, /Productor está deshabilitado/],
  ])('mensaje del %s al confirmar', async (status, cuerpo, patron) => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => (u === '/api/generaciones' ? json(estimacion(), 201) : json(cuerpo, status))))
    render(<MenuFoto {...props} />)
    fireEvent.click(await estimar())
    expect(await screen.findByRole('alert')).toHaveTextContent(patron)
    if (status === 402) expect(screen.getByRole('button', { name: /Confirmar US\$/ })).toBeDisabled()
    else expect(screen.queryByRole('button', { name: /Confirmar US\$/ })).toBeNull()
    if (status === 410) expect(router.refresh).not.toHaveBeenCalled()
  })

  it('si estimar falla (410 foto borrada) muestra el error y no ofrece confirmar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'La foto se borró.' }, 410)))
    render(<MenuFoto {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Estimar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La foto se borró.')
    expect(screen.queryByRole('button', { name: /Confirmar US\$/ })).toBeNull()
  })

  it('cambiar la edición descarta una estimación vieja', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(estimacion(), 201)))
    render(<MenuFoto {...props} />)
    await estimar()
    fireEvent.click(screen.getByLabelText(/Ruta abierta/))
    expect(screen.queryByRole('button', { name: /Confirmar US\$/ })).toBeNull()
  })
})
