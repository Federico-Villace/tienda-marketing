import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MOTORES, estimar } from '@/lib/creativos/motores'
import { Compuerta } from './compuerta'

describe('Compuerta: calculadora de volumen de referencia (S12.1, S12.4)', () => {
  it('se presenta como calculadora de referencia, no como la compuerta real', () => {
    render(<Compuerta />)
    expect(screen.getByRole('heading', { name: /Calculadora de volumen \(referencia\)/ })).toBeInTheDocument()
    expect(screen.getByText(/compuerta real está en el\s+Productor/)).toBeInTheDocument()
  })

  it('no tiene botón de confirmar ni promete jobs: no hay nada que confirmar acá', () => {
    render(<Compuerta />)
    expect(screen.queryByRole('button', { name: /Confirmar/ })).toBeNull()
    expect(screen.queryByText(/arrancan los jobs/)).toBeNull()
  })

  it('S12.1 los motores de imagen son los oficiales del Productor', () => {
    render(<Compuerta />)
    const motor = screen.getAllByLabelText('Motor')[0]!
    const ids = within(motor).getAllByRole('option').map((o) => (o as HTMLOptionElement).value)
    expect(ids).toEqual(MOTORES.filter((m) => m.tipo === 'imagen').map((m) => m.id))
    expect(ids).toContain('gemini-nano-banana-2.1')
    expect(ids).toContain('gemini-3-pro-image')
  })

  it('S12.4 los videos aparecen como referenciales, no disponibles', () => {
    render(<Compuerta />)
    const motorVideo = screen.getAllByLabelText('Motor')[1]!
    for (const o of within(motorVideo).getAllByRole('option')) expect(o).toHaveTextContent(/referencial, no disponible/)
    expect(screen.getByText(/Video: referencial, no disponible/)).toBeInTheDocument()
  })

  it('el contraste usa los motores más caros del catálogo y el total coincide con estimar()', () => {
    render(<Compuerta />)
    const premium = estimar({ imagenes: 20, motorImagen: 'gemini-3-pro-image', videos: 4, segundosPorVideo: 8, motorVideo: 'sora-2-pro' })
    expect(screen.getByText(/Gemini 3 Pro Image \+ Sora 2 Pro/)).toBeInTheDocument()
    expect(premium.totalMin).toBeCloseTo(12.28)
  })
})
