import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { FormularioBrief, type OpcionAnalisis } from './brief'
import { vistaDePrueba } from './fixture'

const analisis: OpcionAnalisis[] = [
  { id: '11111111-1111-4111-8111-111111111111', rotulo: '20 oct · Suzuki Quilmes · 2026-09-21 a 2026-10-20' },
  { id: '22222222-2222-4222-8222-222222222222', rotulo: '19 oct · 999motos · 2026-09-20 a 2026-10-19' },
]

const respuesta = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status })

beforeEach(() => {
  router.refresh.mockClear()
  router.push.mockClear()
})
afterEach(() => vi.unstubAllGlobals())

const props = (o: Partial<React.ComponentProps<typeof FormularioBrief>> = {}) => ({
  analisis,
  habilitado: true,
  desdePorDefecto: '2026-11-01',
  hastaPorDefecto: '2026-11-28',
  ...o,
})

const analisisConMarcas: OpcionAnalisis[] = [
  { ...analisis[0]!, marcas: ['Suzuki Quilmes', 'Zontes Quilmes'] },
  { ...analisis[1]!, marcas: ['999motos'] },
]

const llenar = () => {
  fireEvent.change(screen.getByLabelText('Objetivo'), { target: { value: 'Vender más Zontes' } })
  fireEvent.click(screen.getByLabelText('Zontes Quilmes'))
}

describe('FormularioBrief (S39)', () => {
  it('ofrece los últimos análisis, las 7 marcas, presupuesto, fechas y notas', () => {
    render(<FormularioBrief {...props()} />)
    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(screen.getAllByRole('checkbox')).toHaveLength(8) // 7 marcas + "Todas"
    expect(screen.getByRole('group', { name: /Marcas/ })).toBeInTheDocument()
    expect(screen.getByLabelText(/presupuesto tope/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-11-01')
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-11-28')
    expect(screen.getByLabelText(/notas/i)).toBeInTheDocument()
  })

  it('Generar está deshabilitado sin objetivo, sin marcas, sin análisis o sin OPENAI_API_KEY', () => {
    const { rerender } = render(<FormularioBrief {...props()} />)
    const boton = () => screen.getByRole('button', { name: /generar plan/i })
    expect(boton()).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Objetivo'), { target: { value: 'Vender' } })
    expect(boton()).toBeDisabled() // falta marca
    fireEvent.click(screen.getByLabelText('Zontes Quilmes'))
    expect(boton()).toBeEnabled()
    rerender(<FormularioBrief {...props({ habilitado: false })} />)
    expect(boton()).toBeDisabled()
    rerender(<FormularioBrief {...props({ analisis: [] })} />)
    expect(boton()).toBeDisabled()
    expect(screen.getByText(/primero pedí un análisis/i)).toBeInTheDocument()
  })

  it('manda el brief por POST y lleva a la raíz del plan generado, con el costo a la vista', async () => {
    const f = vi.fn(async () => respuesta({ plan: vistaDePrueba({ raizId: 'raiz-9', costoUsd: 0.0021 }), desdeCache: false }))
    vi.stubGlobal('fetch', f)
    render(<FormularioBrief {...props()} />)
    llenar()
    fireEvent.change(screen.getByLabelText(/presupuesto tope/i), { target: { value: '500000' } })
    fireEvent.change(screen.getByLabelText(/notas/i), { target: { value: 'Ojo con Facebook' } })
    fireEvent.click(screen.getByRole('button', { name: /generar plan/i }))

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/campanas?plan=raiz-9'))
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/planes')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      analisisId: analisis[0]!.id,
      objetivo: 'Vender más Zontes',
      marcas: ['Zontes Quilmes'],
      producto: null,
      presupuestoTopeArs: 500000,
      desde: '2026-11-01',
      hasta: '2026-11-28',
      notas: 'Ojo con Facebook',
    })
    expect(router.refresh).toHaveBeenCalled()
  })

  it('con un plan que vino del caché avisa que no costó nada', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta({ plan: vistaDePrueba(), desdeCache: true })))
    render(<FormularioBrief {...props()} />)
    llenar()
    fireEvent.click(screen.getByRole('button', { name: /generar plan/i }))
    expect(await screen.findByText(/desde caché · sin costo extra/)).toBeInTheDocument()
  })

  it('mientras genera avisa, deshabilita y un segundo click no dispara otro pedido', async () => {
    let terminar!: (r: Response) => void
    const f = vi.fn(() => new Promise<Response>((res) => (terminar = res)))
    vi.stubGlobal('fetch', f)
    render(<FormularioBrief {...props()} />)
    llenar()
    const boton = screen.getByRole('button', { name: /generar plan/i })
    fireEvent.click(boton)
    fireEvent.click(boton)
    expect(boton).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(/puede tardar/i)
    expect(f).toHaveBeenCalledTimes(1)
    terminar(respuesta({ plan: vistaDePrueba(), desdeCache: false }))
    await waitFor(() => expect(router.push).toHaveBeenCalled())
  })

  it('S46: un error de la API se muestra (con la lista de errores del brief) sin romper', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta({ error: 'El brief no es válido.', errores: ['La ventana no puede pasar de 90 días.'] }, 400)))
    render(<FormularioBrief {...props()} />)
    llenar()
    fireEvent.click(screen.getByRole('button', { name: /generar plan/i }))
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(/90 días/)
    expect(screen.getByRole('button', { name: /generar plan/i })).toBeEnabled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('el botón anuncia el costo aproximado', () => {
    render(<FormularioBrief {...props()} />)
    expect(screen.getByRole('button', { name: /generar plan/i })).toHaveTextContent('~US$ 0,002')
  })
})

describe('FormularioBrief · varias marcas (ADR-028)', () => {
  it('"Todas" elige las 7 y el POST las manda por nombre', async () => {
    const f = vi.fn(async () => respuesta({ plan: vistaDePrueba(), desdeCache: false }))
    vi.stubGlobal('fetch', f)
    render(<FormularioBrief {...props()} />)
    fireEvent.change(screen.getByLabelText('Objetivo'), { target: { value: 'Vender' } })
    fireEvent.click(screen.getByLabelText('Todas'))
    fireEvent.click(screen.getByRole('button', { name: /generar plan/i }))
    await waitFor(() => expect(f).toHaveBeenCalled())
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body)).marcas).toHaveLength(7)
  })

  it('arranca con las marcas del análisis elegido', () => {
    render(<FormularioBrief {...props({ analisis: analisisConMarcas })} />)
    expect(screen.getByLabelText('Suzuki Quilmes')).toBeChecked()
    expect(screen.getByLabelText('Zontes Quilmes')).toBeChecked()
    expect(screen.getByLabelText('999motos')).not.toBeChecked()
  })

  it('al cambiar de análisis se preseleccionan sus marcas, salvo que ya hayas tocado el campo', () => {
    render(<FormularioBrief {...props({ analisis: analisisConMarcas })} />)
    fireEvent.change(screen.getByLabelText('Análisis base'), { target: { value: analisis[1]!.id } })
    expect(screen.getByLabelText('999motos')).toBeChecked()
    expect(screen.getByLabelText('Zontes Quilmes')).not.toBeChecked()

    fireEvent.click(screen.getByLabelText('Benelli Store Quilmes')) // lo tocó
    fireEvent.change(screen.getByLabelText('Análisis base'), { target: { value: analisis[0]!.id } })
    expect(screen.getByLabelText('Benelli Store Quilmes')).toBeChecked()
    expect(screen.getByLabelText('Zontes Quilmes')).not.toBeChecked()
  })

  it('?analisis=&marca= preselecciona ese análisis y esas marcas, y no se pisan al cambiar de análisis', () => {
    render(<FormularioBrief {...props({ analisis: analisisConMarcas, analisisInicial: analisis[1]!.id, marcasIniciales: ['Zontes Quilmes', 'QJ Motor Quilmes'] })} />)
    expect(screen.getByLabelText('Análisis base')).toHaveValue(analisis[1]!.id)
    expect(screen.getByLabelText('Zontes Quilmes')).toBeChecked()
    expect(screen.getByLabelText('QJ Motor Quilmes')).toBeChecked()
    expect(screen.getByLabelText('999motos')).not.toBeChecked()
    fireEvent.change(screen.getByLabelText('Análisis base'), { target: { value: analisis[0]!.id } })
    expect(screen.getByLabelText('QJ Motor Quilmes')).toBeChecked()
  })

  it('un análisis inicial que no existe cae en el primero', () => {
    render(<FormularioBrief {...props({ analisis: analisisConMarcas, analisisInicial: 'no-existe' })} />)
    expect(screen.getByLabelText('Análisis base')).toHaveValue(analisis[0]!.id)
  })

  it('no se puede dejar sin marcas una vez elegida la última', () => {
    render(<FormularioBrief {...props()} />)
    fireEvent.click(screen.getByLabelText('Zontes Quilmes'))
    fireEvent.click(screen.getByLabelText('Zontes Quilmes'))
    expect(screen.getByLabelText('Zontes Quilmes')).toBeChecked()
  })
})
