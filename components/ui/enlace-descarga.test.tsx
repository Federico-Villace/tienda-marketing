import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EnlaceDescarga } from './enlace-descarga'
import type { DepsDescarga } from '@/lib/descargas/descargar'

const deps = (o: Partial<DepsDescarga> = {}): DepsDescarga => ({
  puedeCompartirArchivos: () => false,
  traerArchivo: vi.fn(async (_u: string, n: string) => new File(['x'], n)),
  compartir: vi.fn(async () => {}),
  clickEnlace: vi.fn(),
  abrir: vi.fn(),
  esperar: vi.fn(async () => {}),
  ...o,
})

describe('<EnlaceDescarga>', () => {
  it('en escritorio es un link común: no intercepta el click', () => {
    const d = deps()
    render(<EnlaceDescarga href="https://x/a.png" nombre="a.png" deps={d}>Descargar</EnlaceDescarga>)
    const link = screen.getByRole('link', { name: 'Descargar' })
    expect(link).toHaveAttribute('href', 'https://x/a.png')
    expect(fireEvent.click(link)).toBe(true)
    expect(d.compartir).not.toHaveBeenCalled()
  })

  it('en el celu abre el menú de compartir en vez de navegar', async () => {
    const d = deps({ puedeCompartirArchivos: () => true })
    render(<EnlaceDescarga href="https://x/a.png" nombre="a.png" deps={d}>Descargar</EnlaceDescarga>)
    expect(fireEvent.click(screen.getByRole('link', { name: 'Descargar' }))).toBe(false)
    await waitFor(() => expect(d.compartir).toHaveBeenCalledTimes(1))
  })

  it('si compartir falla, abre la imagen y explica cómo guardarla', async () => {
    const d = deps({ puedeCompartirArchivos: () => true, compartir: vi.fn(async () => { throw new Error('x') }) })
    render(<EnlaceDescarga href="https://x/a.png" nombre="a.png" deps={d}>Descargar</EnlaceDescarga>)
    fireEvent.click(screen.getByRole('link', { name: 'Descargar' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Mantené apretada')
    expect(d.abrir).toHaveBeenCalledWith('https://x/a.png')
  })
})
