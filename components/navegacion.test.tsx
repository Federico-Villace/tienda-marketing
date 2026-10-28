import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { Navegacion, SECCIONES } from './navegacion'

const MAS = ['/tablero', '/campanas', '/contenido', '/creativos', '/publicaciones', '/fases']

describe('SECCIONES', () => {
  it('"Promociones" es la primera y la principal; el resto de las herramientas van en "Más herramientas"', () => {
    expect(SECCIONES[0]).toMatchObject({ href: '/promocionar', nombre: 'Promociones', grupo: 'principal' })
    for (const h of MAS) expect(SECCIONES.find((s) => s.href === h)?.grupo, h).toBe('mas')
  })
  it('nada se perdió: siguen todas las pantallas de antes', () => {
    for (const h of ['/', '/tablero', '/campanas', '/contenido', '/creativos', '/publicaciones', '/fases', '/configuracion']) {
      expect(SECCIONES.some((s) => s.href === h), h).toBe(true)
    }
  })
  it('las herramientas del menú "Más" dicen qué hay adentro: nombre claro y una línea de descripción', () => {
    for (const h of MAS) {
      const s = SECCIONES.find((x) => x.href === h)!
      expect(s.descripcion, h).toBeTruthy()
      expect(s.nombre, h).not.toMatch(/Analista|Estratega|Contenidista|Productor|Fases/)
    }
  })
})

describe('<Navegacion>', () => {
  it('es un landmark de navegación con nombre', () => {
    render(<Navegacion activa="/" />)
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument()
  })

  it('"Promociones" es el primer link y se ve resaltado', () => {
    render(<Navegacion activa="/" />)
    const links = screen.getAllByRole('link')
    expect(links[0]).toHaveAccessibleName(/Promociones/)
    expect(links[0]).toHaveAttribute('href', '/promocionar')
    expect(links[0]!.className).toMatch(/border-\(--color-ok\)/)
  })

  it('las otras herramientas van bajo "Más herramientas", con su descripción', () => {
    render(<Navegacion activa="/" />)
    const detalle = screen.getByText('Más herramientas').closest('details')!
    expect(detalle).not.toBeNull()
    for (const nombre of ['Resultados y análisis', 'Planes de campaña', 'Textos', 'Imágenes', 'Hoja de ruta']) {
      expect(within(detalle).getByRole('link', { name: new RegExp(nombre) })).toBeInTheDocument()
    }
    expect(within(detalle).getByRole('link', { name: /Resultados y análisis/ })).toHaveAttribute('href', '/tablero')
    expect(within(detalle).queryByRole('link', { name: /Promociones/ })).toBeNull()
    expect(detalle).toHaveTextContent(/Qué funcionó/)
  })

  it('el bloque "Más" viene cerrado, salvo que estés en una de esas pantallas', () => {
    const { unmount } = render(<Navegacion activa="/" />)
    expect(screen.getByText('Más herramientas').closest('details')).not.toHaveAttribute('open')
    unmount()
    render(<Navegacion activa="/creativos" />)
    expect(screen.getByText('Más herramientas').closest('details')).toHaveAttribute('open')
  })

  it('la pantalla activa lleva aria-current="page"', () => {
    render(<Navegacion activa="/promocionar" />)
    expect(screen.getByRole('link', { name: /Promociones/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')).toHaveLength(1)
  })

  it('sigue estando Inicio, Configuración y Salir, y ya no hay insignias técnicas (F1, F2...)', () => {
    render(<Navegacion activa="/" />)
    for (const n of ['Inicio', 'Configuración']) expect(screen.getByRole('link', { name: n })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salir' })).toBeInTheDocument()
    expect(screen.getByRole('navigation')).not.toHaveTextContent(/\bF[0-4]\b/)
  })
})
