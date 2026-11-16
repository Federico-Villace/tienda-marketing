import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MostrarTextos } from './mostrar-textos'

describe('<MostrarTextos>', () => {
  it('todo tildado por defecto; destildar uno manda la lista de lo sacado, en orden', () => {
    const onCambiar = vi.fn()
    render(<MostrarTextos ocultos={['lugar']} onCambiar={onCambiar} deshabilitado={false} />)
    expect(screen.getAllByRole('checkbox')).toHaveLength(7)
    expect(screen.getByRole('checkbox', { name: 'Lugar' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Modelo' })).toBeChecked()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Modelo' }))
    expect(onCambiar).toHaveBeenCalledWith(['modelo', 'lugar'])
  })
  it('volver a tildar lo saca de la lista', () => {
    const onCambiar = vi.fn()
    render(<MostrarTextos ocultos={['modelo', 'lugar']} onCambiar={onCambiar} deshabilitado={false} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Lugar' }))
    expect(onCambiar).toHaveBeenCalledWith(['modelo'])
  })
  it('"Logos" saca los dos logos juntos', () => {
    const onCambiar = vi.fn()
    render(<MostrarTextos ocultos={[]} onCambiar={onCambiar} deshabilitado={false} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Logos' }))
    expect(onCambiar).toHaveBeenCalledWith(['logo999', 'logoConcesionaria'])
  })
  it('en una clásica no hay botón', () => {
    render(<MostrarTextos clasica ocultos={[]} onCambiar={() => {}} deshabilitado={false} />)
    expect(screen.queryByRole('checkbox', { name: 'Consultanos' })).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Frase' })).toBeInTheDocument()
  })
  it('deshabilitado no deja tocar nada', () => {
    render(<MostrarTextos ocultos={[]} onCambiar={() => {}} deshabilitado />)
    for (const c of screen.getAllByRole('checkbox')) expect(c).toBeDisabled()
  })
})
