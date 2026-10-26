import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { Galeria } from './galeria'
import { creativoDePrueba, piezaImagenDePrueba } from './fixture'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const generacion = { id: 'g1', estado: 'ok', motor: 'gemini-nano-banana-2.1', cantidad: 2, costoEstimadoUsd: 0.0867, costoRealUsd: 0.0675, error: null, creadoEn: '2026-10-26T12:00:00Z', interrumpida: false }
const pieza = piezaImagenDePrueba({
  generaciones: [generacion],
  creativos: [
    creativoDePrueba({ id: 'c1', orden: 1 }),
    creativoDePrueba({ id: 'c2', orden: 2, elegida: true, url: 'https://abc.supabase.co/x/2.jpg?token=T2' }),
    creativoDePrueba({ id: 'c3', orden: 3, url: null, error: 'Gemini 503: sobrecarga', costoUsd: 0 }),
  ],
})

beforeEach(() => router.refresh.mockClear())
afterEach(() => vi.unstubAllGlobals())

describe('Galeria (S11.4, S11.6)', () => {
  it('muestra cada imagen con el alt de la pieza y la URL firmada', () => {
    render(<Galeria pieza={pieza} puedeEditar />)
    const imgs = screen.getAllByRole('img')
    expect(imgs).toHaveLength(2)
    expect(imgs[0]).toHaveAttribute('src', expect.stringContaining('token=T1'))
    expect(imgs[0]).toHaveAttribute('alt', pieza.pieza.altText!)
  })

  it('marca la elegida y muestra el error de la que falló, con su costo', () => {
    render(<Galeria pieza={pieza} puedeEditar />)
    expect(screen.getAllByText('Elegida')).toHaveLength(1)
    expect(screen.getByText(/Gemini 503: sobrecarga/)).toBeInTheDocument()
    expect(screen.getByText(/Costo real: US\$ 0,0675/)).toBeInTheDocument()
  })

  it('con permiso: "Usar esta imagen" en las no elegidas y "Dejar de usar" en la elegida; solo en las que tienen imagen', () => {
    render(<Galeria pieza={pieza} puedeEditar />)
    expect(screen.getAllByRole('button', { name: /^Usar esta imagen/ })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /^Dejar de usar/ })).toHaveLength(1)
  })

  it('S11.6 el lector solo mira: ningún botón', () => {
    render(<Galeria pieza={pieza} puedeEditar={false} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getAllByRole('img')).toHaveLength(2)
  })

  it('elegir llama al PATCH y refresca', async () => {
    const f = vi.fn(async () => json({ creativo: { id: 'c1', elegida: true } }))
    vi.stubGlobal('fetch', f)
    render(<Galeria pieza={pieza} puedeEditar />)
    fireEvent.click(screen.getByRole('button', { name: /^Usar esta imagen/ }))
    await waitFor(() => expect(router.refresh).toHaveBeenCalled())
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/creativos/c1')
    expect(JSON.parse(String(init.body))).toEqual({ elegida: true })
  })

  it('si el PATCH falla muestra el error y no refresca', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Tu rol no permite elegir imágenes.' }, 403)))
    render(<Galeria pieza={pieza} puedeEditar />)
    fireEvent.click(screen.getByRole('button', { name: /^Usar esta imagen/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Tu rol no permite elegir imágenes.')
    expect(router.refresh).not.toHaveBeenCalled()
  })

  it('avisa si una generación quedó interrumpida', () => {
    const p = piezaImagenDePrueba({ generaciones: [{ ...generacion, estado: 'corriendo', costoRealUsd: null, interrumpida: true }] })
    render(<Galeria pieza={p} puedeEditar />)
    expect(screen.getByText(/interrumpida/i)).toBeInTheDocument()
  })

  it('sin generaciones lo dice', () => {
    render(<Galeria pieza={piezaImagenDePrueba()} puedeEditar />)
    expect(screen.getByText(/Todavía no se generó ninguna imagen/)).toBeInTheDocument()
  })
})

describe('Galeria: elegible (F13)', () => {
  it('con elegible=false oculta los botones de usar pero muestra las imágenes y la marca Elegida', () => {
    render(<Galeria pieza={pieza} puedeEditar elegible={false} />)
    expect(screen.queryByRole('button', { name: /Usar esta imagen|Dejar de usar/ })).toBeNull()
    expect(screen.getAllByRole('img')).toHaveLength(2)
  })

  it('por defecto es elegible', () => {
    render(<Galeria pieza={pieza} puedeEditar />)
    expect(screen.getAllByRole('button', { name: /Usar esta imagen|Dejar de usar/ }).length).toBeGreaterThan(0)
  })

  it('acepta el contenido de una foto (sin pieza) y muestra el nombre de la edición', () => {
    const foto = {
      pieza: { altText: 'Foto editada' },
      generaciones: [{ ...generacion, edicion: 'fondo_estudio' }],
      creativos: [creativoDePrueba({ id: 'c1' })],
    }
    render(<Galeria pieza={foto} puedeEditar elegible={false} />)
    expect(screen.getByText('Fondo de estudio')).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Foto editada')
  })
})

describe('Galeria: escena de una promoción', () => {
  it('etiqueta las imágenes pedidas desde una promoción', () => {
    const foto = {
      pieza: { altText: 'Foto editada' },
      generaciones: [{ ...generacion, edicion: 'promocion' }],
      creativos: [creativoDePrueba({ id: 'c1' })],
    }
    render(<Galeria pieza={foto} puedeEditar elegible={false} />)
    expect(screen.getByText('Para una promoción')).toBeInTheDocument()
  })
})

describe('Galeria: insignia y leyenda (rediseño)', () => {
  it('con elegible=false explica por qué no hay botón para usarla', () => {
    render(<Galeria pieza={pieza} puedeEditar elegible={false} />)
    expect(screen.getByText(/Usar en una publicación llega en la próxima etapa/)).toBeInTheDocument()
  })

  it('con elegible no muestra esa leyenda', () => {
    render(<Galeria pieza={pieza} puedeEditar />)
    expect(screen.queryByText(/llega en la próxima etapa/)).toBeNull()
  })

  it('muestra la insignia de origen si se la pasan', () => {
    render(<Galeria pieza={pieza} puedeEditar insignia="Desde texto" />)
    expect(screen.getAllByText('Desde texto').length).toBeGreaterThan(0)
  })
})
