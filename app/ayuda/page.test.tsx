import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import Ayuda from './page'
import { SECCIONES_AYUDA } from '@/lib/ayuda/contenido'

describe('/ayuda', () => {
  it('cada link del índice lleva a una sección que existe', () => {
    const { container } = render(<Ayuda />)
    const indice = screen.getByRole('navigation', { name: 'Contenido del manual' })
    const anclas = within(indice).getAllByRole('link')
    expect(anclas).toHaveLength(SECCIONES_AYUDA.length)
    for (const a of anclas) {
      const id = a.getAttribute('href')!.slice(1)
      expect(container.querySelector(`section#${id}`), id).not.toBeNull()
    }
  })

  it('los ids de las secciones no se repiten (si no, el ancla lleva a la equivocada)', () => {
    const ids = SECCIONES_AYUDA.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('el manual trae el menú de navegación, también para el lector (no depende del rol)', () => {
    render(<Ayuda />)
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeTruthy()
  })
})
