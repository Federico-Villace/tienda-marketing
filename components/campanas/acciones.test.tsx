import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { Acciones } from './acciones'
import { vistaDePrueba } from './fixture'

const respuesta = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status })

beforeEach(() => {
  router.refresh.mockClear()
  router.push.mockClear()
})
afterEach(() => vi.unstubAllGlobals())

const botones = () => screen.queryAllByRole('button').map((b) => b.textContent)

describe('Acciones (S41)', () => {
  it('borrador de la punta: OK, Editar y Descartar', () => {
    render(<Acciones vista={vistaDePrueba()} puedeEditar esPunta />)
    expect(botones()).toEqual(['OK', 'Editar', 'Descartar'])
  })

  it('aprobado: solo Editar (sigue vigente hasta aprobar el nuevo)', () => {
    render(<Acciones vista={vistaDePrueba({ estado: 'aprobado' })} puedeEditar esPunta />)
    expect(botones()).toEqual(['Editar'])
  })

  it('descartado o reemplazado, o una versión que no es la punta: sin botones', () => {
    for (const props of [{ estado: 'descartado' as const, esPunta: true }, { estado: 'reemplazado' as const, esPunta: true }, { estado: 'borrador' as const, esPunta: false }]) {
      const { unmount } = render(<Acciones vista={vistaDePrueba({ estado: props.estado })} puedeEditar esPunta={props.esPunta} />)
      expect(botones()).toEqual([])
      unmount()
    }
  })

  it('lector: ninguna acción, solo aviso de solo lectura', () => {
    render(<Acciones vista={vistaDePrueba()} puedeEditar={false} esPunta />)
    expect(botones()).toEqual([])
    expect(screen.getByText(/solo lectura/i)).toBeInTheDocument()
  })

  it('OK manda PATCH aprobar con la versión y refresca', async () => {
    const f = vi.fn(async () => respuesta({ plan: vistaDePrueba({ estado: 'aprobado' }) }))
    vi.stubGlobal('fetch', f)
    render(<Acciones vista={vistaDePrueba()} puedeEditar esPunta />)
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    await waitFor(() => expect(router.refresh).toHaveBeenCalled())
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/planes/p1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toEqual({ accion: 'aprobar', version: 3 })
  })

  it('Descartar manda PATCH descartar', async () => {
    const f = vi.fn(async () => respuesta({ plan: vistaDePrueba({ estado: 'descartado' }) }))
    vi.stubGlobal('fetch', f)
    render(<Acciones vista={vistaDePrueba()} puedeEditar esPunta />)
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(router.refresh).toHaveBeenCalled())
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ accion: 'descartar', version: 3 })
  })

  it('un 409 muestra el aviso y refresca para ver lo último', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta({ error: 'Este plan cambió: recargá la pantalla.' }, 409)))
    render(<Acciones vista={vistaDePrueba()} puedeEditar esPunta />)
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/cambió/)
    expect(router.refresh).toHaveBeenCalled()
  })

  it('S46: un error de red o de la API se muestra sin romper', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    render(<Acciones vista={vistaDePrueba()} puedeEditar esPunta />)
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(botones()).toContain('OK')
  })

  it('mientras actúa, los botones quedan deshabilitados y un segundo click no repite', async () => {
    let terminar!: (r: Response) => void
    const f = vi.fn(() => new Promise<Response>((res) => (terminar = res)))
    vi.stubGlobal('fetch', f)
    render(<Acciones vista={vistaDePrueba()} puedeEditar esPunta />)
    const ok = screen.getByRole('button', { name: 'OK' })
    fireEvent.click(ok)
    fireEvent.click(ok)
    expect(ok).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeDisabled()
    expect(f).toHaveBeenCalledTimes(1)
    terminar(respuesta({ plan: vistaDePrueba() }))
    await waitFor(() => expect(router.refresh).toHaveBeenCalled())
  })

  it('Editar abre el editor y Cancelar lo cierra', () => {
    render(<Acciones vista={vistaDePrueba()} puedeEditar esPunta />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(screen.getByLabelText('Objetivo')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(screen.queryByLabelText('Objetivo')).not.toBeInTheDocument()
  })
})
