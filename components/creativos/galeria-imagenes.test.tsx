import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { GaleriaImagenes } from './galeria-imagenes'
import { creativoDePrueba, piezaImagenDePrueba } from './fixture'

const generacion = (id: string, creadoEn: string) => ({
  id, estado: 'ok', motor: 'gemini-nano-banana-2.1', cantidad: 1, costoEstimadoUsd: 0.04, costoRealUsd: 0.03, error: null, creadoEn, interrumpida: false,
})
const piezas = [
  piezaImagenDePrueba({
    id: 'p1',
    generaciones: [generacion('gt', '2026-10-26T12:00:00Z')],
    creativos: [creativoDePrueba({ id: 'ct', generacionId: 'gt' })],
  }),
]
const fotos = [
  {
    id: 'f1', ancho: 10, alto: 10, creadoEn: '2026-10-27T09:00:00Z', url: 'https://x/f1.jpg',
    generaciones: [{ ...generacion('gf', '2026-10-27T10:00:00Z'), edicion: 'fondo_estudio' }],
    creativos: [creativoDePrueba({ id: 'cf', generacionId: 'gf' })],
  },
]

const secciones = () => screen.getAllByRole('region').filter((r) => r.getAttribute('aria-label')?.startsWith('Generación'))

describe('GaleriaImagenes: una sola galería', () => {
  it('junta las generaciones de piezas y fotos, la más nueva primero, cada una con su insignia', () => {
    render(<GaleriaImagenes piezas={piezas} fotos={fotos} puedeEditar />)
    const [primera, segunda] = secciones()
    expect(within(primera!).getByText('Desde foto')).toBeInTheDocument()
    expect(within(segunda!).getByText('Desde texto')).toBeInTheDocument()
  })

  it('"Usar esta imagen" solo existe en las de texto; las de foto explican que usarlas llega después', () => {
    render(<GaleriaImagenes piezas={piezas} fotos={fotos} puedeEditar />)
    const [deFoto, deTexto] = secciones()
    expect(within(deFoto!).queryByRole('button', { name: /Usar esta imagen/ })).toBeNull()
    expect(within(deFoto!).getByText(/llega en la próxima etapa/)).toBeInTheDocument()
    expect(within(deTexto!).getByRole('button', { name: /Usar esta imagen 1/ })).toBeInTheDocument()
  })

  it('el filtro muestra todas, solo desde foto o solo desde texto', () => {
    render(<GaleriaImagenes piezas={piezas} fotos={fotos} puedeEditar />)
    expect(screen.getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Desde foto' }))
    expect(secciones()).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Desde foto' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Desde texto' }))
    expect(secciones()).toHaveLength(1)
    expect(screen.getByRole('button', { name: /Usar esta imagen 1/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Todas' }))
    expect(secciones()).toHaveLength(2)
  })

  it('si el filtro no tiene nada lo dice', () => {
    render(<GaleriaImagenes piezas={piezas} fotos={[]} puedeEditar />)
    fireEvent.click(screen.getByRole('button', { name: 'Desde foto' }))
    expect(screen.getByText(/Todavía no hay imágenes desde foto/)).toBeInTheDocument()
  })

  it('sin nada generado explica qué va a aparecer', () => {
    render(<GaleriaImagenes piezas={[]} fotos={[]} puedeEditar />)
    expect(screen.getByText(/Todavía no se generó ninguna imagen/)).toBeInTheDocument()
  })

  it('el lector ve las imágenes pero ningún botón de elegir', () => {
    render(<GaleriaImagenes piezas={piezas} fotos={fotos} puedeEditar={false} />)
    expect(screen.queryByRole('button', { name: /Elegir|Quitar/ })).toBeNull()
    expect(screen.getAllByRole('img')).toHaveLength(2)
  })

  it('las imágenes de foto llevan alt de foto editada y las de texto el de la pieza', () => {
    render(<GaleriaImagenes piezas={piezas} fotos={fotos} puedeEditar />)
    const alts = screen.getAllByRole('img').map((i) => i.getAttribute('alt'))
    expect(alts).toContain('Foto de la moto editada')
  })
})
