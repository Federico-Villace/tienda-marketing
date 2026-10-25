import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { AnalisisVista } from '@/lib/analista/historial'
import type { Filtros } from '@/lib/datos/filtros'

const refresh = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import { Analista, formatearUsd } from './analista'

const filtros: Filtros = { marcaIds: ['100206789578448'], plataforma: 'todas', desde: '2026-09-21', hasta: '2026-10-20' }

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
  original: 'Resumen: anduvo bien.',
  version: 1,
  editadoEn: null,
  editadoPor: null,
  versiones: [{ version: 1, fecha: '2026-10-20T15:00:00Z', autor: null }],
  ...o,
})

const editada = (o: Partial<AnalisisVista> = {}) =>
  vista({
    contenido: 'Texto corregido por Julián',
    version: 2,
    editadoEn: '2026-10-21T10:00:00Z',
    editadoPor: 'u-1',
    versiones: [
      { version: 2, fecha: '2026-10-21T10:00:00Z', autor: 'u-1' },
      { version: 1, fecha: '2026-10-20T15:00:00Z', autor: null },
    ],
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

describe('Analista · varias marcas', () => {
  const dos: Filtros = { ...filtros, marcaIds: ['100206789578448', '1327958853726987'] }

  it('manda las marcas como lista', async () => {
    const f = vi.fn(async () => respuesta({ analisis: vista({ filtros: dos }), desdeCache: false }))
    vi.stubGlobal('fetch', f)
    render(<Analista {...props({ filtros: dos })} />)
    fireEvent.click(screen.getByRole('button', { name: /analizar/i }))
    await screen.findByText('Resumen: anduvo bien.')
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body)).marcas).toEqual(dos.marcaIds)
  })

  it('avisa que con varias marcas compara entre ellas y después las suma', () => {
    render(<Analista {...props({ filtros: dos })} />)
    expect(screen.getByText(/compara entre las marcas y después las suma/i)).toBeInTheDocument()
  })

  it('con una sola marca no hay ese aviso', () => {
    render(<Analista {...props()} />)
    expect(screen.queryByText(/compara entre las marcas/i)).toBeNull()
  })

  it('el análisis recién hecho tiene el link "Armar un plan con este análisis" con sus marcas', async () => {
    vi.stubGlobal('fetch', async () => respuesta({ analisis: vista({ id: 'an-9', filtros: dos }), desdeCache: false }))
    render(<Analista {...props({ filtros: dos })} />)
    fireEvent.click(screen.getByRole('button', { name: /analizar/i }))
    await screen.findByText('Resumen: anduvo bien.')
    const link = screen.getByRole('link', { name: /armar un plan con este análisis/i })
    const u = new URL(link.getAttribute('href')!, 'http://x')
    expect(u.pathname).toBe('/campanas')
    expect(u.searchParams.get('analisis')).toBe('an-9')
    expect(u.searchParams.getAll('marca')).toEqual(dos.marcaIds)
  })

  it('cada análisis del historial también lo ofrece', () => {
    render(<Analista {...props({ filtros: dos, historial: [vista({ id: 'an-3', filtros: dos })] })} />)
    expect(screen.getByRole('link', { name: /armar un plan con este análisis/i })).toHaveAttribute('href', expect.stringContaining('analisis=an-3'))
  })

  it('el rótulo del historial nombra las marcas', () => {
    render(<Analista {...props({ filtros: dos, historial: [vista({ filtros: dos })] })} />)
    expect(screen.getByText(/Suzuki Quilmes y Zontes Quilmes/)).toBeInTheDocument()
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
      marcas: filtros.marcaIds,
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

  describe('editar análisis anteriores', () => {
    it('sin permiso de edición no hay botón Editar', () => {
      render(<Analista {...props({ historial: [vista()] })} />)
      expect(screen.queryByRole('button', { name: /^editar/i })).toBeNull()
    })

    it('muestra la versión vigente, la marca como editada y deja ver el original', () => {
      render(<Analista {...props({ historial: [editada()], puedeEditar: true })} />)
      expect(screen.getByText('Texto corregido por Julián')).toBeInTheDocument()
      expect(screen.getByText(/v2 · editado/i)).toBeInTheDocument()
      expect(screen.getByText('Resumen: anduvo bien.')).toBeInTheDocument()
      expect(screen.getByRole('list', { name: /versiones/i })).toBeInTheDocument()
    })

    it('un análisis sin editar no muestra marca de edición ni lista de versiones', () => {
      render(<Analista {...props({ historial: [vista()], puedeEditar: true })} />)
      expect(screen.queryByText(/editado/i)).toBeNull()
      expect(screen.queryByRole('list', { name: /versiones/i })).toBeNull()
    })

    it('Editar abre el editor con el texto vigente; guardar manda PATCH con la versión vista y refresca', async () => {
      const f = vi.fn(async () => respuesta({ analisis: editada() }))
      vi.stubGlobal('fetch', f)
      render(<Analista {...props({ historial: [vista({ id: 'a1' })], puedeEditar: true })} />)
      fireEvent.click(screen.getByRole('button', { name: /^editar/i }))
      const campo = screen.getByRole('textbox', { name: /texto del análisis/i })
      expect(campo).toHaveValue('Resumen: anduvo bien.')
      expect(screen.getByText(/versión 2, sin costo/i)).toBeInTheDocument()

      fireEvent.change(campo, { target: { value: 'Resumen corregido' } })
      fireEvent.click(screen.getByRole('button', { name: /guardar como versión 2/i }))
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))

      const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toBe('/api/analisis/a1')
      expect(init.method).toBe('PATCH')
      expect(JSON.parse(String(init.body))).toEqual({ contenido: 'Resumen corregido', version: 1 })
      expect(screen.queryByRole('textbox', { name: /texto del análisis/i })).toBeNull()
    })

    it('un 409 avisa que otra persona lo cambió y refresca', async () => {
      vi.stubGlobal('fetch', async () => respuesta({ error: 'Este análisis cambió: recargá la pantalla.' }, 409))
      render(<Analista {...props({ historial: [vista()], puedeEditar: true })} />)
      fireEvent.click(screen.getByRole('button', { name: /^editar/i }))
      fireEvent.click(screen.getByRole('button', { name: /guardar como versión 2/i }))
      expect(await screen.findByRole('alert')).toHaveTextContent(/otra persona/i)
      expect(refresh).toHaveBeenCalledTimes(1)
    })

    it('un texto vacío no se manda', () => {
      const f = vi.fn()
      vi.stubGlobal('fetch', f)
      render(<Analista {...props({ historial: [vista()], puedeEditar: true })} />)
      fireEvent.click(screen.getByRole('button', { name: /^editar/i }))
      fireEvent.change(screen.getByRole('textbox', { name: /texto del análisis/i }), { target: { value: '   ' } })
      expect(screen.getByRole('button', { name: /guardar como versión 2/i })).toBeDisabled()
      expect(f).not.toHaveBeenCalled()
    })

    it('Cancelar cierra el editor sin pedir nada', () => {
      const f = vi.fn()
      vi.stubGlobal('fetch', f)
      render(<Analista {...props({ historial: [vista()], puedeEditar: true })} />)
      fireEvent.click(screen.getByRole('button', { name: /^editar/i }))
      fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
      expect(screen.queryByRole('textbox', { name: /texto del análisis/i })).toBeNull()
      expect(f).not.toHaveBeenCalled()
    })
  })
})
