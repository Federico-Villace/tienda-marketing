import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { ActualizarEstadisticas } from './actualizar'

const respuesta = (cuerpo: unknown, status = 200, headers?: Record<string, string>) =>
  new Response(JSON.stringify(cuerpo), { status, headers })

beforeEach(() => router.refresh.mockClear())
afterEach(() => vi.unstubAllGlobals())

const ok = { publicidad: { estado: 'ok', filas: 40, resumen: '2 cuentas · 40 filas' }, organico: { estado: 'ok', filas: 12, resumen: '4 cuentas · 12 filas' } }

describe('ActualizarEstadisticas', () => {
  it('lector: sin botón y sin aviso propio (el aviso único lo pone la pantalla)', () => {
    const { container } = render(<ActualizarEstadisticas puedeActualizar={false} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(container).toBeEmptyDOMElement()
  })

  it('click: POST a /api/actualizar, deshabilitado y con texto de espera mientras corre', async () => {
    let terminar!: (r: Response) => void
    const f = vi.fn(() => new Promise<Response>((r) => (terminar = r)))
    vi.stubGlobal('fetch', f)
    render(<ActualizarEstadisticas puedeActualizar />)
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar estadísticas' }))
    const boton = await screen.findByRole('button', { name: /actualizando/i })
    expect(boton).toBeDisabled()
    expect(f).toHaveBeenCalledWith('/api/actualizar', expect.objectContaining({ method: 'POST' }))
    terminar(respuesta(ok))
    await waitFor(() => expect(router.refresh).toHaveBeenCalled())
  })

  it('un doble click rápido manda un solo pedido', async () => {
    const f = vi.fn(async () => respuesta(ok))
    vi.stubGlobal('fetch', f)
    render(<ActualizarEstadisticas puedeActualizar />)
    const b = screen.getByRole('button', { name: 'Actualizar estadísticas' })
    fireEvent.click(b)
    fireEvent.click(b)
    await waitFor(() => expect(router.refresh).toHaveBeenCalled())
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('éxito: muestra el resumen de cada tipo y refresca', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(ok)))
    render(<ActualizarEstadisticas puedeActualizar />)
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar estadísticas' }))
    await waitFor(() => expect(router.refresh).toHaveBeenCalled())
    expect(screen.getByRole('status')).toHaveTextContent('2 cuentas · 40 filas')
    expect(screen.getByRole('status')).toHaveTextContent('4 cuentas · 12 filas')
    expect(screen.getByRole('button', { name: 'Actualizar estadísticas' })).toBeEnabled()
  })

  it('parcial: lo dice y muestra el error de lo que falló', async () => {
    const parcial = { ...ok, organico: { estado: 'parcial', filas: 3, resumen: '3 de 4 cuentas · 3 filas', error: 'p: (#200) x' } }
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(parcial)))
    render(<ActualizarEstadisticas puedeActualizar />)
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar estadísticas' }))
    await waitFor(() => expect(router.refresh).toHaveBeenCalled())
    expect(screen.getByRole('status')).toHaveTextContent(/parcial/i)
    expect(screen.getByRole('status')).toHaveTextContent('p: (#200) x')
  })

  it.each([
    [409, 'Ya hay una actualización en curso'],
    [429, 'Probá de nuevo en 7 minutos'],
  ])('%i: muestra el mensaje del servidor y no pisa nada', async (status, error) => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta({ error }, status)))
    render(<ActualizarEstadisticas puedeActualizar />)
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar estadísticas' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(error)
    expect(screen.getByRole('button', { name: 'Actualizar estadísticas' })).toBeEnabled()
  })

  it('un corte de red se informa sin lanzar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('red') }))
    render(<ActualizarEstadisticas puedeActualizar />)
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar estadísticas' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/conexión/i)
  })
})
