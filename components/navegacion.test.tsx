import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { Navegacion, SECCIONES } from './navegacion'

const AVANZADAS = ['/tablero', '/campanas', '/contenido', '/creativos', '/publicaciones']

describe('SECCIONES', () => {
  it('"Nueva promoción" es la primera y la principal; las herramientas de cada agente son avanzadas', () => {
    expect(SECCIONES[0]).toMatchObject({ href: '/promocionar', nombre: 'Nueva promoción', grupo: 'principal' })
    for (const h of AVANZADAS) expect(SECCIONES.find((s) => s.href === h)?.grupo, h).toBe('avanzado')
  })
  it('nada se perdió: siguen todas las pantallas de antes', () => {
    for (const h of ['/', '/tablero', '/campanas', '/contenido', '/creativos', '/publicaciones', '/fases', '/configuracion']) {
      expect(SECCIONES.some((s) => s.href === h), h).toBe(true)
    }
  })
})

describe('<Navegacion>', () => {
  it('"Nueva promoción" es el primer link y se ve resaltado', () => {
    render(<Navegacion activa="/" />)
    const links = screen.getAllByRole('link')
    expect(links[0]).toHaveAccessibleName(/Nueva promoción/)
    expect(links[0]).toHaveAttribute('href', '/promocionar')
    expect(links[0]!.className).toMatch(/border-\(--color-ok\)/)
  })

  it('las herramientas de cada agente van bajo "Herramientas avanzadas"', () => {
    render(<Navegacion activa="/" />)
    const detalle = screen.getByText('Herramientas avanzadas').closest('details')!
    expect(detalle).not.toBeNull()
    for (const nombre of ['Analista', 'Estratega', 'Contenidista', 'Productor']) {
      expect(within(detalle).getByRole('link', { name: new RegExp(nombre) })).toBeInTheDocument()
    }
    expect(within(detalle).queryByRole('link', { name: /Nueva promoción/ })).toBeNull()
  })

  it('el bloque avanzado viene cerrado, salvo que estés en una de esas pantallas', () => {
    const { unmount } = render(<Navegacion activa="/" />)
    expect(screen.getByText('Herramientas avanzadas').closest('details')).not.toHaveAttribute('open')
    unmount()
    render(<Navegacion activa="/creativos" />)
    expect(screen.getByText('Herramientas avanzadas').closest('details')).toHaveAttribute('open')
  })

  it('la pantalla activa lleva aria-current="page"', () => {
    render(<Navegacion activa="/promocionar" />)
    expect(screen.getByRole('link', { name: /Nueva promoción/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')).toHaveLength(1)
  })

  it('sigue estando Inicio, Fases, Configuración y Salir', () => {
    render(<Navegacion activa="/" />)
    for (const n of ['Inicio', 'Fases', 'Configuración']) expect(screen.getByRole('link', { name: n })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salir' })).toBeInTheDocument()
  })
})
