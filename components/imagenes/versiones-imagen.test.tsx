import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VersionesImagen, urlParaDescargar } from './versiones-imagen'
import { creativoDePrueba } from '@/components/creativos/fixture'
import { versionesDeImagen, type GeneracionVista } from '@/lib/productor/pantalla'

const gen = (id: string, o: Partial<GeneracionVista> = {}): GeneracionVista => ({
  id, estado: 'ok', motor: 'gemini-nano-banana-2.1', cantidad: 1, costoEstimadoUsd: 0.05, costoRealUsd: 0.04, error: null, creadoEn: '2026-10-29T10:00:00Z', interrumpida: false, ...o,
})
const versiones = versionesDeImagen(
  [gen('g2', { ajuste: { instruccion: 'más oscuro', baseCreativoId: 'c1' } }), gen('g1', { creadoEn: '2026-10-29T09:00:00Z' })],
  [creativoDePrueba({ id: 'c1', generacionId: 'g1' }), creativoDePrueba({ id: 'c2', generacionId: 'g2' })],
)
const base = { versiones, alt: () => 'alt', puedeEditar: true }

describe('VersionesImagen', () => {
  it('cada imagen se puede descargar con un link que fuerza la descarga', () => {
    render(<VersionesImagen {...base} usar={{ modo: 'ninguno' }} />)
    const links = screen.getAllByRole('link', { name: 'Descargar' })
    expect(links).toHaveLength(2)
    expect(links[0]!.getAttribute('href')).toBe(urlParaDescargar(creativoDePrueba().url!))
    expect(urlParaDescargar('https://x/a?token=T')).toMatch(/\?token=T&download=/)
  })

  it('una versión creada por un cambio dice qué se pidió y sobre qué imagen', () => {
    render(<VersionesImagen {...base} usar={{ modo: 'ninguno' }} />)
    expect(screen.getByText('Versión 2 · Cambio: «más oscuro»')).toBeInTheDocument()
    expect(screen.getByText('Original')).toBeInTheDocument()
    expect(screen.getByText(/sobre la imagen #1/)).toBeInTheDocument()
  })

  it('radio: elegir manda el id; el lector las ve deshabilitadas', () => {
    const alElegir = vi.fn()
    const { rerender } = render(<VersionesImagen {...base} usar={{ modo: 'radio', elegidoId: 'c1', alElegir, bloqueado: false }} />)
    // c1 está en uso: la otra versión se ofrece como "volver" y es gratis.
    fireEvent.click(screen.getByRole('radio', { name: 'Volver a esta versión · Gratis' }))
    expect(alElegir).toHaveBeenCalledWith('c2')
    expect(screen.getByText('En uso')).toBeInTheDocument()
    rerender(<VersionesImagen {...base} puedeEditar={false} usar={{ modo: 'radio', elegidoId: 'c1', alElegir, bloqueado: false }} />)
    for (const r of screen.getAllByRole('radio')) expect(r).toBeDisabled()
  })

  it('botón: el lector no ve ningún botón de usar', () => {
    render(<VersionesImagen {...base} puedeEditar={false} usar={{ modo: 'boton', alAlternar: vi.fn(), bloqueado: false }} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('"Pedile un cambio" y otras acciones se enchufan debajo de cada imagen', () => {
    render(<VersionesImagen {...base} usar={{ modo: 'ninguno' }} accionesDe={(c) => <span>acción {c.id}</span>} />)
    expect(screen.getByText('acción c1')).toBeInTheDocument()
    expect(screen.getByText('acción c2')).toBeInTheDocument()
  })
})
