import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ElegirFoto } from './elegir-foto'

const fotos = [
  { id: 'a', creadoEn: '2026-10-25T10:00:00+00:00', url: 'https://x/a.jpg', modelo: 'TRK 502' },
  { id: 'b', creadoEn: '2026-10-20T10:00:00+00:00', url: null, modelo: null },
]

describe('<ElegirFoto>', () => {
  it('cada foto se identifica por el modelo de la última promoción que la usó, o dice que no tiene moto', () => {
    render(<ElegirFoto fotos={fotos} valor={null} onElegir={() => {}} />)
    expect(screen.getByRole('radio', { name: /TRK 502/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Foto sin moto asignada/ })).toBeInTheDocument()
  })

  it('elegir una avisa cuál y la elegida queda marcada', () => {
    const onElegir = vi.fn()
    render(<ElegirFoto fotos={fotos} valor="b" onElegir={onElegir} />)
    expect(screen.getByRole('radio', { name: /Foto sin moto asignada/ })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: /TRK 502/ }))
    expect(onElegir).toHaveBeenCalledWith('a')
  })
})
