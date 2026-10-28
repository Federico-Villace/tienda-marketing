import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
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

describe('Destacados', () => {
  it('muestra las campañas rankeadas y avisa cuántas quedaron afuera por muestra', () => {
    const d = destacarCampanias([camp('A', 30), camp('B', 10), { ...camp('C', 1), gasto: 500 }], todas, true)
    render(<Destacados campanias={d} publicaciones={null} />)
    expect(screen.getByText(/Campaña A/)).toBeInTheDocument()
    expect(screen.getByText(/Campaña B/)).toBeInTheDocument()
    expect(screen.queryByText(/Campaña C/)).not.toBeInTheDocument()
    expect(screen.getByText(/1 campaña sin muestra suficiente/)).toBeInTheDocument()
  })

  it('un post sin permalink se muestra sin link; con permalink, el link abre en pestaña nueva', () => {
    const base = (i: number, o: Partial<Publicacion> = {}): Publicacion => ({
      id: `p${i}`, marcaId: MARCAS[0]!.id, plataforma: 'instagram', tipo: 'reel', texto: 'x', permalink: null,
      alcance: null, clics: null, publicadoEn: new Date('2026-10-01T12:00:00Z'), vistas: 1000,
      meGusta: 10, comentarios: 0, compartidos: 0, guardados: 0, ...o,
    })
    const ps = [1, 2, 3, 4, 5].map((i) => base(i)).concat(base(6, { vistas: 4000, permalink: 'https://ig/6' }), base(7, { vistas: 100 }))
    render(<Destacados campanias={null} publicaciones={destacarPublicaciones(ps, '2026-10-28')} />)
    const link = screen.getByRole('link', { name: /ver en instagram/i })
    expect(link).toHaveAttribute('href', 'https://ig/6')
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })
})
