import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { PedirCambioImagen } from './pedir-cambio-imagen'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const estimacion = () => ({
  generacion: { id: 'g9', motor: 'm', cantidad: 1, aspecto: '4:5', porImagenUsd: 0.045, listaUsd: 0.045, costoEstimadoUsd: 0.047, venceEn: '2026-10-25T13:00:00Z' },
  mes: { gastadoUsd: 1, topeUsd: 10 },
  excedeTope: false,
})
const props = { creativoId: 'c1', promocionId: 'p1', puedeEditar: true, apagado: null, topeUsd: 10, gastadoUsd: 1 }
const abrir = () => fireEvent.click(screen.getByRole('button', { name: 'Pedile un cambio' }))
const escribir = (t: string) => fireEvent.change(screen.getByLabelText(/Qué querés cambiar/), { target: { value: t } })

afterEach(() => {
  vi.unstubAllGlobals()
  router.refresh.mockClear()
})

describe('PedirCambioImagen', () => {
  it('cerrado no hay formulario ni requests; abrirlo tampoco gasta ni estima', () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    render(<PedirCambioImagen {...props} />)
    expect(screen.queryByLabelText(/Qué querés cambiar/)).toBeNull()
    abrir()
    expect(f).not.toHaveBeenCalled()
  })

  it('sin un pedido de al menos 3 letras no se puede ver el precio; el contador no pasa de 400', () => {
    render(<PedirCambioImagen {...props} />)
    abrir()
    expect(screen.getByRole('button', { name: 'Ver precio del cambio' })).toBeDisabled()
    expect(screen.getByLabelText(/Qué querés cambiar/)).toHaveAttribute('maxlength', '400')
    escribir('  ab ')
    expect(screen.getByRole('button', { name: 'Ver precio del cambio' })).toBeDisabled()
    escribir('más oscuro')
    expect(screen.getByRole('button', { name: 'Ver precio del cambio' })).toBeEnabled()
  })

  it('estima con la imagen, el pedido limpio y la promoción, SIN precio del cliente, y no confirma solo', async () => {
    const f = vi.fn(async () => json(estimacion(), 201))
    vi.stubGlobal('fetch', f)
    render(<PedirCambioImagen {...props} />)
    abrir()
    escribir('  más oscuro, de noche ')
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio del cambio' }))
    await screen.findByRole('button', { name: /Confirmar US\$/ })
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/generaciones')
    expect(JSON.parse(String(init.body))).toEqual({ creativoId: 'c1', instruccion: 'más oscuro, de noche', promocionId: 'p1' })
  })

  it('doble click en Confirmar: un solo cobro; al terminar avisa con las imágenes nuevas', async () => {
    let terminar!: (r: Response) => void
    const f = vi.fn((u: string) => (u === '/api/generaciones' ? Promise.resolve(json(estimacion(), 201)) : new Promise<Response>((r) => (terminar = r))))
    vi.stubGlobal('fetch', f)
    const alTerminar = vi.fn()
    render(<PedirCambioImagen {...props} alTerminar={alTerminar} />)
    abrir()
    escribir('más oscuro')
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio del cambio' }))
    const confirmar = await screen.findByRole('button', { name: /Confirmar US\$/ })
    fireEvent.click(confirmar)
    fireEvent.click(confirmar)
    await waitFor(() => expect(screen.getByRole('button', { name: /Generando/ })).toBeDisabled())
    expect(screen.getByLabelText(/Qué querés cambiar/)).toBeDisabled()
    expect(f.mock.calls.filter((c) => String((c as unknown as [string])[0]).includes('confirmar'))).toHaveLength(1)
    terminar(json({ generacion: { id: 'g9', estado: 'ok', costoRealUsd: 0.04, costoEstimadoUsd: 0.047, error: null }, creativos: [{ id: 'cN', url: 'https://x/n.jpg' }] }))
    await waitFor(() => expect(alTerminar).toHaveBeenCalledTimes(1))
  })

  it('un error del servidor se ve (p. ej. la promoción ya no es un borrador)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Volvé a editar la promoción para pedir cambios.' }, 409)))
    render(<PedirCambioImagen {...props} />)
    abrir()
    escribir('más oscuro')
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio del cambio' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Volvé a editar la promoción')
  })

  it('el lector no ve nada', () => {
    render(<PedirCambioImagen {...props} puedeEditar={false} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
