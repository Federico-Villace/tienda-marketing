import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { AnalisisVista } from '@/lib/analista/historial'
import type { Filtros } from '@/lib/datos/filtros'

const refresh = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import { Analista, formatearUsd } from './analista'

const filtros: Filtros = { marcaId: '100206789578448', plataforma: 'todas', desde: '2026-09-21', hasta: '2026-10-20' }

const vista = (o: Partial<AnalisisVista> = {}): AnalisisVista => ({
  id: 'a1',
  contenido: 'Resumen: anduvo bien.',
  modelo: 'gpt-6-luna',
  costoUsd: 0.0013,
  tokensEntrada: 3000,
  tokensSalida: 2000,
  creadoEn: '2026-10-20T15:00:00Z',
  filtros,
  desdeCache: false,
  ...o,
})

const props = (o: Partial<React.ComponentProps<typeof Analista>> = {}) => ({
  filtros,
  habilitado: true,
  historial: [] as AnalisisVista[],
  ...o,
})

const respuesta = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status })

beforeEach(() => refresh.mockClear())
afterEach(() => vi.unstubAllGlobals())

describe('formatearUsd', () => {
  it('muestra al menos 4 decimales con coma', () => {
    expect(formatearUsd(0.0013)).toBe('US$ 0,0013')
    expect(formatearUsd(0)).toBe('US$ 0,0000')
    expect(formatearUsd(0.001234)).toBe('US$ 0,001234')
  })
})

describe('Analista', () => {
  it('manda los filtros por POST a /api/analisis', async () => {
    const f = vi.fn(async () => respuesta({ analisis: vista(), desdeCache: false }))
    vi.stubGlobal('fetch', f)
    render(<Analista {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: /analizar/i }))
    await screen.findByText('Resumen: anduvo bien.')

    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/analisis')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      marca: filtros.marcaId,
      plataforma: 'todas',
      desde: '2026-09-21',
      hasta: '2026-10-20',
    })
  })

  it('mientras carga, el botón queda deshabilitado, avisa, y un segundo click no dispara otro fetch', async () => {
    let terminar!: (r: Response) => void
    const f = vi.fn(() => new Promise<Response>((res) => (terminar = res)))
    vi.stubGlobal('fetch', f)
    render(<Analista {...props()} />)
    const boton = screen.getByRole('button', { name: /analizar/i })
    fireEvent.click(boton)

    await waitFor(() => expect(boton).toBeDisabled())
    expect(screen.getByText(/analizando/i)).toBeInTheDocument()
    fireEvent.click(boton)
    expect(f).toHaveBeenCalledTimes(1)

    terminar(respuesta({ analisis: vista(), desdeCache: false }))
    await screen.findByText('Resumen: anduvo bien.')
    expect(boton).toBeEnabled()
  })

  it('muestra el texto, el modelo y el costo en US$ con 4 decimales', async () => {
    vi.stubGlobal('fetch', async () => respuesta({ analisis: vista(), desdeCache: false }))
    render(<Analista {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: /analizar/i }))
    await screen.findByText('Resumen: anduvo bien.')
    expect(screen.getByText('US$ 0,0013')).toBeInTheDocument()
    expect(screen.getByText(/gpt-6-luna/)).toBeInTheDocument()
    expect(screen.queryByText(/desde caché/i)).toBeNull()
  })

  it('si se reutilizó uno guardado, lo dice y no muestra un costo nuevo', async () => {
    vi.stubGlobal('fetch', async () => respuesta({ analisis: vista({ desdeCache: true }), desdeCache: true }))
    render(<Analista {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: /analizar/i }))
    await screen.findByText(/desde caché/i)
    expect(screen.getByText(/sin costo extra/i)).toBeInTheDocument()
  })

  it('después de un análisis ok refresca la página para actualizar el historial', async () => {
    vi.stubGlobal('fetch', async () => respuesta({ analisis: vista(), desdeCache: false }))
    render(<Analista {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: /analizar/i }))
    await screen.findByText('Resumen: anduvo bien.')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('un error del servidor se muestra como alerta, sin texto parcial, y rehabilita el botón', async () => {
    vi.stubGlobal('fetch', async () => respuesta({ error: 'OpenAI respondió con un error (500).' }, 502))
    render(<Analista {...props()} />)
    const boton = screen.getByRole('button', { name: /analizar/i })
    fireEvent.click(boton)
    expect(await screen.findByRole('alert')).toHaveTextContent('OpenAI respondió con un error (500).')
    expect(boton).toBeEnabled()
    expect(refresh).not.toHaveBeenCalled()
    expect(screen.queryByText(/US\$/)).toBeNull()
  })

  it('si la red falla, muestra un error genérico', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed')
    })
    render(<Analista {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: /analizar/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo/i)
  })

  it('sin OPENAI_API_KEY el botón está deshabilitado y lo explica', () => {
    render(<Analista {...props({ habilitado: false })} />)
    expect(screen.getByRole('button', { name: /analizar/i })).toBeDisabled()
    expect(screen.getByText('OPENAI_API_KEY')).toBeInTheDocument()
  })

  it('sin historial dice "Todavía no hay análisis"', () => {
    render(<Analista {...props()} />)
    expect(screen.getByText('Todavía no hay análisis')).toBeInTheDocument()
  })

  it('muestra como máximo los últimos 5 del historial', () => {
    const historial = Array.from({ length: 7 }, (_, i) => vista({ id: `a${i}`, contenido: `texto ${i}` }))
    render(<Analista {...props({ historial })} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
  })

  it('cada fila del historial lleva el costo y el texto desplegable', () => {
    render(<Analista {...props({ historial: [vista({ costoUsd: 0.0021 })] })} />)
    expect(screen.getByText('US$ 0,0021')).toBeInTheDocument()
    expect(screen.getByText('Resumen: anduvo bien.')).toBeInTheDocument()
  })

  it('avisa cuando no hay publicaciones en el período', () => {
    render(<Analista {...props({ sinPublicaciones: true })} />)
    expect(screen.getByText('No hay publicaciones en el período')).toBeInTheDocument()
  })
})
