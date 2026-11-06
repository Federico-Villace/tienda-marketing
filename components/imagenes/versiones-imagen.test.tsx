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
    // Ampliar y comparar solo miran: no son controles de edición.
    expect(screen.queryAllByRole('button', { name: /^(?!Ampliar|Ver las dos)/ })).toHaveLength(0)
  })

  it('"Pedile un cambio" y otras acciones se enchufan debajo de cada imagen', () => {
    render(<VersionesImagen {...base} usar={{ modo: 'ninguno' }} accionesDe={(c) => <span>acción {c.id}</span>} />)
    expect(screen.getByText('acción c1')).toBeInTheDocument()
    expect(screen.getByText('acción c2')).toBeInTheDocument()
  })
})

describe('VersionesImagen · ampliar y comparar', () => {
  it('marcar dos imágenes y tocar "Ver las dos juntas" las muestra a las dos; una tercera reemplaza a la más vieja; sin red', () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    render(<VersionesImagen {...base} usar={{ modo: 'ninguno' }} />)
    const ver = screen.getByRole('button', { name: 'Ver las dos juntas' })
    expect(ver).toBeDisabled()
    const cajas = screen.getAllByRole('checkbox')
    fireEvent.click(cajas[0]!)
    fireEvent.click(cajas[1]!)
    expect(ver).toBeEnabled()
    fireEvent.click(ver)
    expect(screen.getByRole('dialog', { name: 'Comparar versiones' })).toBeInTheDocument()
    expect(f).not.toHaveBeenCalled()
  })

  it('marcar una tercera saca la marca más vieja (siempre son dos)', () => {
    const tres = versionesDeImagen([gen('g1')], [creativoDePrueba({ id: 'a', generacionId: 'g1', orden: 1 }), creativoDePrueba({ id: 'b', generacionId: 'g1', orden: 2 }), creativoDePrueba({ id: 'c', generacionId: 'g1', orden: 3 })])
    render(<VersionesImagen {...base} versiones={tres} usar={{ modo: 'ninguno' }} />)
    const cajas = screen.getAllByRole('checkbox')
    for (const c of cajas) fireEvent.click(c)
    expect(cajas.map((c) => (c as HTMLInputElement).checked)).toEqual([false, true, true])
  })

  it('tocar una imagen la abre grande y Cerrar vuelve', () => {
    render(<VersionesImagen {...base} usar={{ modo: 'ninguno' }} />)
    fireEvent.click(screen.getAllByRole('button', { name: /^Ampliar/ })[0]!)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
