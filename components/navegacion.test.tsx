import { describe, it, expect } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { Navegacion, SECCIONES } from './navegacion'

const MAS = ['/creativos', '/contenido', '/campanas', '/publicaciones', '/fases', '/configuracion']

describe('SECCIONES', () => {
  it('nada se perdió: siguen todas las pantallas de antes', () => {
    for (const h of ['/tablero', '/campanas', '/contenido', '/creativos', '/publicaciones', '/fases', '/configuracion', '/promocionar']) {
      expect(SECCIONES.some((s) => s.href === h), h).toBe(true)
    }
  })
})

function abrir() {
  fireEvent.click(screen.getByRole('button', { name: /Más/ }))
}

describe('<Navegacion>', () => {
  it('la marca lleva al inicio y Promociones y Resultados están a la vista', () => {
    render(<Navegacion activa="/" />)
    expect(screen.getByRole('link', { name: '999 Motos' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Promociones' })).toHaveAttribute('href', '/promocionar')
    expect(screen.getByRole('link', { name: 'Resultados' })).toHaveAttribute('href', '/tablero')
  })

  it('en el inicio no hay ninguna sección marcada', () => {
    render(<Navegacion activa="/" />)
    expect(screen.getAllByRole('link').filter((l) => l.getAttribute('aria-current'))).toHaveLength(0)
    expect(screen.getByRole('button', { name: /Más/ })).not.toHaveAttribute('aria-current')
  })

  it('Promociones queda activa también en sus subpáginas', () => {
    render(<Navegacion activa="/promocionar/nueva" />)
    expect(screen.getByRole('link', { name: 'Promociones' })).toHaveAttribute('aria-current', 'page')
  })

  it('"Más" abre y cierra con click, y muestra todos los destinos', () => {
    render(<Navegacion activa="/" />)
    const boton = screen.getByRole('button', { name: /Más/ })
    expect(boton).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: /Textos/ })).toBeNull()
    abrir()
    expect(boton).toHaveAttribute('aria-expanded', 'true')
    const hrefs = screen.getAllByRole('link').map((l) => l.getAttribute('href'))
    for (const h of MAS) expect(hrefs, h).toContain(h)
    fireEvent.click(boton)
    expect(boton).toHaveAttribute('aria-expanded', 'false')
  })

  it('"Más" se cierra con Escape y con click afuera', () => {
    render(<Navegacion activa="/" />)
    const boton = screen.getByRole('button', { name: /Más/ })
    abrir()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(boton).toHaveAttribute('aria-expanded', 'false')
    abrir()
    fireEvent.mouseDown(document.body)
    expect(boton).toHaveAttribute('aria-expanded', 'false')
  })

  it('si estás en una pantalla del menú, "Más" figura activo y el item lleva aria-current', () => {
    render(<Navegacion activa="/creativos" />)
    expect(screen.getByRole('button', { name: /Más/ })).toHaveAttribute('aria-current', 'true')
    abrir()
    expect(screen.getByRole('link', { name: /Imágenes/ })).toHaveAttribute('aria-current', 'page')
  })

  it('Salir sigue disponible y manda el formulario de logout', () => {
    render(<Navegacion activa="/" />)
    const nav = screen.getByRole('navigation', { name: 'Principal' })
    const salir = within(nav).getByRole('button', { name: 'Salir' })
    expect(salir.closest('form')).toHaveAttribute('action', '/api/auth/logout')
    expect(salir.closest('form')).toHaveAttribute('method', 'post')
  })
})
