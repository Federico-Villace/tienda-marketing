import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImagenAmpliable, Lightbox } from './lightbox'

afterEach(() => vi.unstubAllGlobals())

describe('ImagenAmpliable', () => {
  it('abre la imagen grande en un diálogo, sin pedir nada a la red', () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    render(<ImagenAmpliable src="https://x/a.jpg" alt="Una moto" />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Ampliar/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: 'Una moto' })).toHaveLength(2)
    expect(f).not.toHaveBeenCalled()
  })

  it('Cerrar cierra y el foco vuelve al botón que lo abrió', () => {
    render(<ImagenAmpliable src="https://x/a.jpg" alt="Una moto" />)
    const abrir = screen.getByRole('button', { name: /Ampliar/ })
    fireEvent.click(abrir)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(abrir).toHaveFocus()
  })

  it('Esc cierra', () => {
    render(<ImagenAmpliable src="https://x/a.jpg" alt="Una moto" />)
    fireEvent.click(screen.getByRole('button', { name: /Ampliar/ }))
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('Lightbox', () => {
  it('cerrado no pinta nada', () => {
    render(<Lightbox abierto={false} alCerrar={() => {}} titulo="Algo">hola</Lightbox>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
