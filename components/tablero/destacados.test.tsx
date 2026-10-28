import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { Destacados } from './destacados'
import { destacarCampanias, destacarPublicaciones } from '@/lib/datos/destacados'
import { MARCAS } from '@/lib/datos/marcas'
import type { CampaniaReal } from '@/lib/datos/publicidad'
import type { Publicacion } from '@/lib/datos/tipos'

const camp = (id: string, resultados: number): CampaniaReal => ({
  id,
  nombre: `Campaña ${id}`,
  cuenta: 'act',
  objetivo: 'OUTCOME_ENGAGEMENT',
  estado: 'ACTIVE',
  gasto: 30000,
  impresiones: 100000,
  clics: 400,
  resultados,
  dias: 7,
  ultimoDia: null,
})

const todas = MARCAS.map((m) => m.id)

const base = (i: number, o: Partial<Publicacion> = {}): Publicacion => ({
  id: `p${i}`, marcaId: MARCAS[0]!.id, plataforma: 'instagram', tipo: 'reel', texto: `post ${i}`, permalink: null,
  alcance: null, clics: null, publicadoEn: new Date('2026-10-01T12:00:00Z'), vistas: 1000,
  meGusta: 10, comentarios: 0, compartidos: 0, guardados: 0, ...o,
})

/** 12 posts de una cuenta, con vistas distintas: alcanza para 5 mejores y 5 peores. */
const doce = Array.from({ length: 12 }, (_, i) => base(i + 1, { vistas: 200 + i * 300, permalink: `https://ig/${i + 1}` }))

describe('Destacados', () => {
  it('campañas: mejores y peores en tablas y "Ver todas" lista las comparables', () => {
    const d = destacarCampanias([camp('A', 30), camp('B', 10), { ...camp('C', 1), gasto: 500 }], todas, true)
    render(<Destacados campanias={d} publicaciones={null} />)
    const mejores = screen.getByRole('table', { name: /campañas que mejor funcionaron/i })
    expect(within(mejores).getByText('Campaña A')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: /campañas que peor funcionaron/i })).toBeInTheDocument()
    expect(screen.getByText(/Ver todas \(2\)/)).toBeInTheDocument()
    expect(screen.queryByText(/Campaña C/)).not.toBeInTheDocument()
    expect(screen.getByText(/1 campaña sin muestra suficiente/)).toBeInTheDocument()
  })

  it('publicaciones: 5 mejores y 5 peores, cada fila con su link, y "Ver todas" las lista a todas', () => {
    render(<Destacados campanias={null} publicaciones={destacarPublicaciones(doce, '2026-10-28')} />)
    const mejores = screen.getByRole('table', { name: 'Publicaciones que mejor funcionaron' })
    const peores = screen.getByRole('table', { name: 'Publicaciones que peor funcionaron' })
    expect(within(mejores).getAllByRole('link')).toHaveLength(5)
    expect(within(peores).getAllByRole('link')).toHaveLength(5)
    expect(within(mejores).getAllByRole('link')[0]).toHaveAttribute('href', 'https://ig/12')

    expect(screen.getByText('Ver todas (12)')).toBeInTheDocument()
    const todas = screen.getByRole('table', { name: 'Todas las publicaciones comparables' })
    const links = within(todas).getAllByRole('link')
    expect(links).toHaveLength(12)
    expect(links[0]).toHaveAttribute('target', '_blank')
  })

  it('un post sin permalink no tiene link', () => {
    const sin = doce.map((p, i) => (i === 0 ? { ...p, permalink: null } : p))
    render(<Destacados campanias={null} publicaciones={destacarPublicaciones(sin, '2026-10-28')} />)
    const todas = screen.getByRole('table', { name: 'Todas las publicaciones comparables' })
    expect(within(todas).getAllByRole('link')).toHaveLength(11)
  })
})
