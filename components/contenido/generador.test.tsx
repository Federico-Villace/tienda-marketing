import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { Generador } from './generador'

const respuesta = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status })
const props = { planId: 'p1', semana: 2, habilitado: true, motivoBloqueo: null, notasPrevias: undefined }

beforeEach(() => {
  router.refresh.mockClear()
  router.push.mockClear()
})
afterEach(() => vi.unstubAllGlobals())

describe('Generador (S48, S49)', () => {
  it('muestra el estimado y el tope en el botón', () => {
    render(<Generador {...props} />)
    expect(screen.getByRole('button', { name: 'Generar semana 2 · ~US$0,002 (tope US$0,004)' })).toBeEnabled()
  })

  it('no genera nada hasta el click y manda plan_id, semana y notas', async () => {
    const f = vi.fn(async () => respuesta({ tanda: { id: 't9', costoUsd: 0.0021 }, piezas: [], desdeCache: false }))
    vi.stubGlobal('fetch', f)
    render(<Generador {...props} />)
    expect(f).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText(/notas/i), { target: { value: '  Foco en financiación ' } })
    fireEvent.click(screen.getByRole('button', { name: /Generar semana 2/ }))
    await waitFor(() => expect(router.refresh).toHaveBeenCalled())
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ plan_id: 'p1', semana: 2, notas: 'Foco en financiación' })
    expect(router.push).toHaveBeenCalledWith('/contenido?plan=p1&tanda=t9')
  })

  it('tras generar muestra el costo real', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta({ tanda: { id: 't9', costoUsd: 0.0021 }, piezas: [], desdeCache: false })))
    render(<Generador {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Generar semana 2/ }))
    expect(await screen.findByText(/Costo real: US\$ 0,0021/)).toBeInTheDocument()
  })

  it('si vino de caché dice "Desde caché: US$ 0"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta({ tanda: { id: 't9', costoUsd: 0.0021 }, piezas: [], desdeCache: true })))
    render(<Generador {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Generar semana 2/ }))
    expect(await screen.findByText(/Desde caché: US\$ 0/)).toBeInTheDocument()
  })

  it('con las mismas notas que la última tanda el botón avisa que sale de caché', () => {
    render(<Generador {...props} notasPrevias={null} />)
    expect(screen.getByRole('button', { name: /desde caché/i })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/notas/i), { target: { value: 'otras notas' } })
    expect(screen.getByRole('button', { name: /Generar semana 2 · ~US\$0,002/ })).toBeInTheDocument()
  })

  it('cuenta las notas contra el tope de 1000', () => {
    render(<Generador {...props} />)
    fireEvent.change(screen.getByLabelText(/notas/i), { target: { value: 'abc' } })
    expect(screen.getByText('3/1000')).toBeInTheDocument()
  })

  it('deshabilitado: sin clave de OpenAI o si la semana excede el tope (con el motivo)', () => {
    const { unmount } = render(<Generador {...props} habilitado={false} />)
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByText(/OPENAI_API_KEY/)).toBeInTheDocument()
    unmount()
    render(<Generador {...props} motivoBloqueo="La semana 2 pide 14 piezas; el tope es 12. Editá el plan." />)
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByText(/el tope es 12/)).toBeInTheDocument()
  })

  it('muestra los errores 409, 422 y 502 de la API', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta({ error: 'Ese plan ya no es el aprobado: elegí el vigente.' }, 409)))
    render(<Generador {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Generar semana 2/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/ya no es el aprobado/)
    expect(router.refresh).not.toHaveBeenCalled()
  })

  it('un doble click no repite el pedido', async () => {
    let terminar!: (r: Response) => void
    const f = vi.fn(() => new Promise<Response>((res) => (terminar = res)))
    vi.stubGlobal('fetch', f)
    render(<Generador {...props} />)
    const b = screen.getByRole('button', { name: /Generar semana 2/ })
    fireEvent.click(b)
    fireEvent.click(b)
    expect(f).toHaveBeenCalledTimes(1)
    terminar(respuesta({ tanda: { id: 't', costoUsd: 0 }, piezas: [], desdeCache: false }))
    await waitFor(() => expect(router.refresh).toHaveBeenCalled())
  })
})
