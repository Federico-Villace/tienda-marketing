import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { GrillaComparacion, type PiezaDeGrilla } from './grilla-comparacion'
import { filaPromocion, copyDePrueba } from '@/lib/promocion/fixture'
import { vistaDePromocion } from '@/lib/promocion/vista'
import type { DepsDescarga } from '@/lib/descargas/descargar'

const fuentes = { titulo: 'Anton', texto: 'Inter' }
const pieza = (i: number, o: Record<string, unknown> = {}, extra: Partial<PiezaDeGrilla> = {}): PiezaDeGrilla => ({
  promocion: vistaDePromocion(filaPromocion({ id: `h${i}`, copy: copyDePrueba(), copy_opcion: 1, plantilla: 'oferta_abajo', fondo: 'fondo_estudio', escena_creativo_id: 'e1', ...o } as never)),
  marca: `Marca ${i}`,
  escenaUrl: 'https://x/e1.jpg',
  descarga: null,
  placaFinal: null,
  ...extra,
})
const aprobada = (i: number) => pieza(i, { estado: 'aprobada' }, { descarga: `https://x/p${i}.png?download=p${i}.png`, placaFinal: `https://x/p${i}.png` })

function deps(o: Partial<DepsDescarga> = {}): DepsDescarga {
  return {
    puedeCompartirArchivos: () => false,
    traerArchivo: vi.fn(async (_u: string, n: string) => new File(['x'], n)),
    compartir: vi.fn(async () => {}),
    clickEnlace: vi.fn(),
    abrir: vi.fn(),
    esperar: vi.fn(async () => {}),
    ...o,
  }
}

describe('<GrillaComparacion>', () => {
  it('una tarjeta por pieza, con la placa en vivo cuando hay imagen y diseño, y sin pedir nada a la red', () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    render(<GrillaComparacion piezas={[pieza(1), pieza(2), pieza(3, { escena_creativo_id: null }, { escenaUrl: null })]} fuentes={fuentes} deps={deps()} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getAllByRole('img', { name: /Vista previa de la imagen/ })).toHaveLength(2)
    expect(f).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('si una pieza cambia (poner imagen o diseño), su tarjeta se actualiza', () => {
    const { rerender } = render(<GrillaComparacion piezas={[pieza(1, { escena_creativo_id: null }, { escenaUrl: null })]} fuentes={fuentes} deps={deps()} />)
    expect(screen.queryByRole('img', { name: /Vista previa de la imagen/ })).toBeNull()
    rerender(<GrillaComparacion piezas={[pieza(1)]} fuentes={fuentes} deps={deps()} />)
    expect(screen.getByRole('img', { name: /Vista previa de la imagen/ })).toBeInTheDocument()
  })

  it('"Descargar todas (N)" baja las N aprobadas, de a una', async () => {
    const d = deps()
    render(<GrillaComparacion piezas={[aprobada(1), pieza(2), aprobada(3)]} fuentes={fuentes} deps={d} />)
    fireEvent.click(screen.getByRole('button', { name: 'Descargar todas (2)' }))
    await waitFor(() => expect(d.clickEnlace).toHaveBeenCalledTimes(2))
    expect(d.clickEnlace).toHaveBeenNthCalledWith(1, 'https://x/p1.png?download=p1.png', expect.stringMatching(/\.png$/))
  })

  it('un doble click no baja dos veces', async () => {
    const d = deps({ esperar: vi.fn(() => new Promise<void>((r) => setTimeout(r, 20))) })
    render(<GrillaComparacion piezas={[aprobada(1), aprobada(2)]} fuentes={fuentes} deps={d} />)
    const b = screen.getByRole('button', { name: 'Descargar todas (2)' })
    fireEvent.click(b)
    fireEvent.click(b)
    await waitFor(() => expect(d.clickEnlace).toHaveBeenCalledTimes(2))
    await new Promise((r) => setTimeout(r, 60))
    expect(d.clickEnlace).toHaveBeenCalledTimes(2)
  })

  it('sin aprobadas el botón está deshabilitado', () => {
    render(<GrillaComparacion piezas={[pieza(1)]} fuentes={fuentes} deps={deps()} />)
    expect(screen.getByRole('button', { name: 'Descargar todas (0)' })).toBeDisabled()
  })

  it('cada aprobada tiene su Descargar; las demás no', async () => {
    const d = deps()
    render(<GrillaComparacion piezas={[aprobada(1), pieza(2)]} fuentes={fuentes} deps={d} />)
    const items = screen.getAllByRole('listitem')
    expect(within(items[1]!).queryByRole('button', { name: /^Descargar/ })).toBeNull()
    fireEvent.click(within(items[0]!).getByRole('button', { name: /^Descargar/ }))
    await waitFor(() => expect(d.clickEnlace).toHaveBeenCalledTimes(1))
  })

  it('si hay que abrir la imagen a mano, avisa cómo guardarla', async () => {
    const d = deps({ clickEnlace: vi.fn(() => { throw new Error('x') }) })
    render(<GrillaComparacion piezas={[aprobada(1)]} fuentes={fuentes} deps={d} />)
    fireEvent.click(screen.getByRole('button', { name: 'Descargar todas (1)' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Mantené apretada la imagen')
  })
})
