import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ListaPublicaciones, Resumen, TablaAgrupada } from './piezas'
import { agruparPorTipo, resumir } from '@/lib/datos/agregados'
import type { Publicacion } from '@/lib/datos/tipos'

const pub = (o: Partial<Publicacion> = {}): Publicacion => ({
  id: 'p1',
  marcaId: 'm1',
  plataforma: 'instagram',
  tipo: 'reel',
  texto: 'Nueva Zontes',
  permalink: 'https://instagram.com/p/x',
  publicadoEn: new Date('2026-10-01T15:00:00Z'),
  vistas: 1000,
  meGusta: 10,
  comentarios: 3,
  compartidos: 2,
  guardados: 5,
  ...o,
})

describe('ListaPublicaciones', () => {
  it('rotula cada columna con un encabezado', () => {
    render(<ListaPublicaciones titulo="Las que mejor funcionaron" publicaciones={[pub()]} />)
    const tabla = screen.getByRole('table', { name: 'Las que mejor funcionaron' })
    const encabezados = within(tabla)
      .getAllByRole('columnheader')
      .map((h) => h.textContent)
    expect(encabezados).toEqual(['Fecha', 'Tipo', 'Publicación', 'Vistas', 'Comentarios', 'Interacciones'])
  })

  it('la última cifra es la suma de me gusta, comentarios, compartidos y guardados', () => {
    render(<ListaPublicaciones titulo="Mejores" publicaciones={[pub()]} />)
    const fila = screen.getByRole('row', { name: /Nueva Zontes/ })
    const celdas = within(fila).getAllByRole('cell')
    expect(celdas[3]).toHaveTextContent('1.000')
    expect(celdas[4]).toHaveTextContent('3')
    expect(celdas[5]).toHaveTextContent('20')
  })

  it('el texto es un link externo seguro al post', () => {
    render(<ListaPublicaciones titulo="Mejores" publicaciones={[pub()]} />)
    const link = screen.getByRole('link', { name: /Nueva Zontes.*nueva pestaña/i })
    expect(link).toHaveAttribute('href', 'https://instagram.com/p/x')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('sin permalink el texto es texto plano', () => {
    render(<ListaPublicaciones titulo="Mejores" publicaciones={[pub({ permalink: null })]} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('Nueva Zontes')).toBeInTheDocument()
  })
})

describe('comentarios en los agregados', () => {
  it('el resumen muestra el total de comentarios', () => {
    const r = resumir([pub({ comentarios: 3 }), pub({ id: 'p2', comentarios: 4 })])
    render(<Resumen resumen={r} />)
    expect(screen.getByText('Comentarios', { selector: 'p' }).parentElement).toHaveTextContent('7')
  })

  it('la tabla agrupada muestra los comentarios promedio', () => {
    const filas = agruparPorTipo([pub({ comentarios: 3 }), pub({ id: 'p2', comentarios: 4 })])
    render(<TablaAgrupada titulo="Por formato" rotuloClave="Formato" filas={filas} />)
    expect(screen.getByRole('columnheader', { name: 'Comentarios prom.' })).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /reel/i })).toHaveTextContent('3,5')
  })
})
