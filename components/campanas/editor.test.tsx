import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { Editor } from './editor'
import { vistaDePrueba } from './fixture'

const respuesta = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status })

beforeEach(() => {
  router.refresh.mockClear()
  router.push.mockClear()
})
afterEach(() => vi.unstubAllGlobals())

describe('Editor (S42)', () => {
  it('abre con los valores del plan', () => {
    render(<Editor vista={vistaDePrueba()} onCerrar={() => {}} />)
    expect(screen.getByLabelText('Objetivo')).toHaveValue('Subir consultas por mensaje')
    expect(screen.getByLabelText('Mensaje central')).toHaveValue('Probá la Zontes este mes')
    expect(screen.getByLabelText('Canal 1 porcentaje')).toHaveValue(70)
    expect(screen.getByLabelText('Monto del presupuesto (ARS)')).toHaveValue(300000)
  })

  it('guarda como versión siguiente: PATCH con el plan editado y la versión que se veía', async () => {
    const f = vi.fn(async () => respuesta({ plan: vistaDePrueba({ version: 4 }) }))
    vi.stubGlobal('fetch', f)
    render(<Editor vista={vistaDePrueba()} onCerrar={() => {}} />)
    fireEvent.change(screen.getByLabelText('Objetivo'), { target: { value: 'Otro objetivo' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar como versión 4/i }))

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/campanas?plan=r1'))
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/planes/p1')
    expect(init.method).toBe('PATCH')
    const cuerpo = JSON.parse(String(init.body))
    expect(cuerpo.version).toBe(3)
    expect(cuerpo.plan.objetivo).toBe('Otro objetivo')
    expect(cuerpo.plan.canales).toHaveLength(2)
    expect(router.refresh).toHaveBeenCalled()
  })

  it('muestra cuánto suman los porcentajes de los canales', () => {
    render(<Editor vista={vistaDePrueba()} onCerrar={() => {}} />)
    expect(screen.getByText(/suman 100%/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Canal 2 porcentaje'), { target: { value: '20' } })
    expect(screen.getByText(/suman 90%/i)).toBeInTheDocument()
  })

  it('agrega y quita filas de canales, segmentos y semanas', () => {
    render(<Editor vista={vistaDePrueba()} onCerrar={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /quitar canal 2/i }))
    expect(screen.queryByLabelText('Canal 2 porcentaje')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /agregar segmento/i }))
    expect(screen.getByLabelText('Segmento 2 nombre')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /agregar semana/i }))
    expect(screen.getByLabelText('Semana 2 eje')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /quitar semana 1/i }))
    // Las semanas se renumeran: la que quedó pasa a ser la 1.
    expect(screen.getByLabelText('Semana 1 eje')).toBeInTheDocument()
    expect(screen.queryByLabelText('Semana 2 eje')).not.toBeInTheDocument()
  })

  it('S42: un 422 muestra los errores de validación y no cierra', async () => {
    const f = vi.fn(async () => respuesta({ error: 'El plan no es válido.', errores: ['Los porcentajes de los canales deben sumar 100.'] }, 422))
    vi.stubGlobal('fetch', f)
    const onCerrar = vi.fn()
    render(<Editor vista={vistaDePrueba()} onCerrar={onCerrar} />)
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(await screen.findByText(/deben sumar 100/)).toBeInTheDocument()
    expect(onCerrar).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('un 409 avisa que el plan cambió y refresca', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta({ error: 'Este plan cambió: recargá la pantalla.' }, 409)))
    render(<Editor vista={vistaDePrueba()} onCerrar={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/cambió/)
    expect(router.refresh).toHaveBeenCalled()
  })

  it('Cancelar cierra sin pedir nada', () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const onCerrar = vi.fn()
    render(<Editor vista={vistaDePrueba()} onCerrar={onCerrar} />)
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(onCerrar).toHaveBeenCalled()
    expect(f).not.toHaveBeenCalled()
  })

  it('un solo envío a la vez: mientras guarda, el botón queda deshabilitado', async () => {
    let terminar!: (r: Response) => void
    const f = vi.fn(() => new Promise<Response>((res) => (terminar = res)))
    vi.stubGlobal('fetch', f)
    render(<Editor vista={vistaDePrueba()} onCerrar={() => {}} />)
    const boton = screen.getByRole('button', { name: /guardar/i })
    fireEvent.click(boton)
    fireEvent.click(boton)
    expect(boton).toBeDisabled()
    expect(f).toHaveBeenCalledTimes(1)
    terminar(respuesta({ plan: vistaDePrueba({ version: 4 }) }))
    await waitFor(() => expect(router.push).toHaveBeenCalled())
  })
})
