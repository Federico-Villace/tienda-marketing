import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { Pieza } from './pieza'
import { grupoDe, piezaVista } from './fixture'
import { piezasDePrueba } from '@/lib/contenidista/fixture'

const respuesta = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status })
const marcas = ['999motos', 'Suzuki Quilmes']

beforeEach(() => {
  router.refresh.mockClear()
})
afterEach(() => vi.unstubAllGlobals())

const botones = () => screen.queryAllByRole('button').map((b) => b.textContent)
const tarjeta = (g = grupoDe(piezaVista()), puedeEditar = true) => render(<Pieza grupo={g} puedeEditar={puedeEditar} marcas={marcas} />)

describe('Pieza · contenido (S50)', () => {
  it('muestra estado, marca, plataforma, formato, fecha, hook, copy, cta y brief visual', () => {
    tarjeta()
    expect(screen.getAllByText('Borrador').length).toBeGreaterThan(0)
    expect(screen.getByText(/999motos · instagram · imagen · 2026-11-04/)).toBeInTheDocument()
    expect(screen.getByText('Mirá cómo nace una moto')).toBeInTheDocument()
    expect(screen.getByText('La moto de la semana.')).toBeInTheDocument()
    expect(screen.getByText(/Escribinos por DM/)).toBeInTheDocument()
    expect(screen.getByText(/Plano general del taller/)).toBeInTheDocument()
  })

  it('contadores: copy con hashtags /2200, hashtags /30 y alt text /1000', () => {
    tarjeta()
    // "La moto de la semana." (21) + "\n\n" + "#motos" (6) = 29
    expect(screen.getByText('29/2200')).toBeInTheDocument()
    expect(screen.getByText('1/30')).toBeInTheDocument()
    expect(screen.getByText('25/1000')).toBeInTheDocument()
  })

  it('un reel muestra el guion y no el alt text', () => {
    tarjeta(grupoDe(piezaVista({ pieza: piezasDePrueba()[0]! })))
    expect(screen.getByText(/Se ve el taller/)).toBeInTheDocument()
    expect(screen.queryByText(/\/1000/)).not.toBeInTheDocument()
  })

  it('avisa "precio a completar" si quedó un [precio]', () => {
    tarjeta(grupoDe(piezaVista({ pieza: { ...piezasDePrueba()[1]!, copy: 'Desde [precio] contado.' } })))
    expect(screen.getByText(/precio a completar/i)).toBeInTheDocument()
  })

  it('lista las versiones con su origen y estado', () => {
    const v2 = piezaVista({ id: 'pz2', version: 2, origen: 'edicion', padreId: 'pz1', raizId: 'pz1' })
    const v1 = piezaVista({ estado: 'reemplazada' })
    tarjeta(grupoDe(v2, v1))
    const lista = screen.getByRole('list', { name: 'Versiones' })
    expect(within(lista).getAllByRole('listitem')).toHaveLength(2)
    expect(within(lista).getByText(/v2/)).toBeInTheDocument()
    expect(within(lista).getByText(/Edición/)).toBeInTheDocument()
  })
})

describe('Pieza · botones por estado y rol (S53)', () => {
  it('borrador: Aprobar, Editar y Descartar', () => {
    tarjeta()
    expect(botones()).toEqual(['Aprobar', 'Editar', 'Descartar'])
  })
  it('aprobada: solo Editar', () => {
    tarjeta(grupoDe(piezaVista({ estado: 'aprobada', aprobadoEn: '2026-10-21T11:00:00Z' })))
    expect(botones()).toEqual(['Editar'])
  })
  it('descartada: sin botones', () => {
    tarjeta(grupoDe(piezaVista({ estado: 'descartada' })))
    expect(botones()).toEqual([])
  })
  it('lector: tarjeta sin botones', () => {
    tarjeta(grupoDe(piezaVista()), false)
    expect(botones()).toEqual([])
    expect(screen.getByText('Mirá cómo nace una moto')).toBeInTheDocument()
  })
})

describe('Pieza · acciones', () => {
  it('Aprobar manda PATCH aprobar con la versión y refresca', async () => {
    const f = vi.fn(async () => respuesta({ pieza: piezaVista({ estado: 'aprobada' }) }))
    vi.stubGlobal('fetch', f)
    tarjeta()
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }))
    await waitFor(() => expect(router.refresh).toHaveBeenCalled())
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/piezas/pz1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toEqual({ accion: 'aprobar', version: 1 })
  })

  it('Descartar manda PATCH descartar', async () => {
    const f = vi.fn(async () => respuesta({ pieza: piezaVista({ estado: 'descartada' }) }))
    vi.stubGlobal('fetch', f)
    tarjeta()
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(router.refresh).toHaveBeenCalled())
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ accion: 'descartar', version: 1 })
  })

  it('S54 un 409 avisa "otra persona cambió esta pieza" y recarga', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta({ error: 'Esta pieza cambió: recargá la pantalla.' }, 409)))
    tarjeta()
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('otra persona cambió esta pieza')
    expect(router.refresh).toHaveBeenCalled()
  })

  it('un error de red se muestra sin romper', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('x') }))
    tarjeta()
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(botones()).toContain('Aprobar')
  })
})

describe('Pieza · editor (S41)', () => {
  const abrir = () => {
    tarjeta()
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
  }

  it('Editar abre el editor con contadores en vivo; Cancelar lo cierra', () => {
    abrir()
    const copy = screen.getByLabelText('Copy')
    fireEvent.change(copy, { target: { value: 'Hola' } })
    // "Hola\n\n#motos" = 12
    expect(screen.getAllByText('12/2200').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(screen.queryByLabelText('Copy')).not.toBeInTheDocument()
  })

  it('el guion solo se edita en reel y video; el alt text solo en imagen y carrusel', () => {
    abrir()
    expect(screen.queryByLabelText('Guion')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Texto alternativo')).toBeInTheDocument()
  })

  it('Guardar manda PATCH con la pieza editada y la versión (hashtags con #)', async () => {
    const f = vi.fn(async () => respuesta({ pieza: piezaVista({ version: 2 }) }))
    vi.stubGlobal('fetch', f)
    abrir()
    fireEvent.change(screen.getByLabelText('Copy'), { target: { value: 'Nuevo texto' } })
    fireEvent.change(screen.getByLabelText('Hashtags'), { target: { value: '#motos quilmes, #oferta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar como versión 2' }))
    await waitFor(() => expect(router.refresh).toHaveBeenCalled())
    const cuerpo = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(cuerpo.version).toBe(1)
    expect(cuerpo.pieza).toMatchObject({ copy: 'Nuevo texto', hashtags: ['#motos', '#quilmes', '#oferta'], plataforma: 'instagram', formato: 'imagen' })
  })

  it('un 422 muestra los errores del validador y deja el editor abierto', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta({ error: 'La pieza no es válida.', errores: ['El copy con los hashtags pasa de 2200 caracteres.'] }, 422)))
    abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar como versión 2' }))
    expect(await screen.findByText(/pasa de 2200/)).toBeInTheDocument()
    expect(screen.getByLabelText('Copy')).toBeInTheDocument()
  })

  it('una historia no tiene copy ni hashtags para editar', () => {
    render(<Pieza grupo={grupoDe(piezaVista({ pieza: { ...piezasDePrueba()[1]!, formato: 'historia', copy: '', hashtags: [], altText: null } }))} puedeEditar marcas={marcas} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(screen.queryByLabelText('Copy')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Hashtags')).not.toBeInTheDocument()
  })
})
