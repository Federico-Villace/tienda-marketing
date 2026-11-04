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

  describe('posts con pauta', () => {
    const pago = base(99, { vistas: 907_610, conPauta: true, campaniaPauta: 'Boost Quilmes', texto: '¿BUSCÁS CAMBIAR DE MOTO?', permalink: 'https://fb/pago' })

    it('un post pago no está en "Lo que funcionó" y sí en "Con pauta" con su link y su campaña', () => {
      render(<Destacados campanias={null} publicaciones={destacarPublicaciones([...doce, pago], '2026-10-28')} />)
      const ranking = screen.getByRole('table', { name: 'Todas las publicaciones comparables' })
      expect(within(ranking).queryByText(/BUSCÁS CAMBIAR/)).not.toBeInTheDocument()

      const lista = screen.getByRole('list', { name: /con pauta/i })
      expect(within(lista).getByText(/BUSCÁS CAMBIAR/)).toBeInTheDocument()
      expect(within(lista).getByText(/Boost Quilmes/)).toBeInTheDocument()
      expect(within(lista).getByRole('link')).toHaveAttribute('href', 'https://fb/pago')
    })

    it('sin posts pagos no se muestra la lista', () => {
      render(<Destacados campanias={null} publicaciones={destacarPublicaciones(doce, '2026-10-28')} />)
      expect(screen.queryByRole('list', { name: /con pauta/i })).not.toBeInTheDocument()
    })

    it('si solo hay posts pagos igual se listan (no se esconden detrás de "no hay con qué comparar")', () => {
      render(<Destacados campanias={null} publicaciones={destacarPublicaciones([pago], '2026-10-28')} />)
      expect(screen.getByRole('list', { name: /con pauta/i })).toBeInTheDocument()
    })
  })
  describe('posts fuera de lo normal', () => {
    // 12 posts de ~200-3500 vistas: la mediana ronda 1.850, el raro la pasa por mucho más de 20×.
    const raro = base(98, { vistas: 907_610, texto: 'Post viral sin anuncio', permalink: 'https://fb/raro' })

    it('un atípico no está en el ranking y sí en "Fuera de lo normal" con su link', () => {
      render(<Destacados campanias={null} publicaciones={destacarPublicaciones([...doce, raro], '2026-10-28')} />)
      const ranking = screen.getByRole('table', { name: 'Todas las publicaciones comparables' })
      expect(within(ranking).queryByText(/Post viral/)).not.toBeInTheDocument()

      const lista = screen.getByRole('list', { name: /fuera de lo normal/i })
      expect(within(lista).getByText(/Post viral/)).toBeInTheDocument()
      expect(within(lista).getByRole('link')).toHaveAttribute('href', 'https://fb/raro')
      expect(screen.getByText(/probablemente se pagó desde otra/i)).toBeInTheDocument()
    })

    it('sin atípicos no se muestra la lista', () => {
      render(<Destacados campanias={null} publicaciones={destacarPublicaciones(doce, '2026-10-28')} />)
      expect(screen.queryByRole('list', { name: /fuera de lo normal/i })).not.toBeInTheDocument()
    })
  })

  describe('textos en una línea', () => {
    const largo = 'Texto larguísimo de una publicación '.repeat(20)

    it('en las dos listas el texto se corta con puntos suspensivos', () => {
      const pago = base(97, { vistas: 5000, conPauta: true, texto: largo })
      const raro = base(96, { vistas: 907_610, texto: largo })
      render(<Destacados campanias={null} publicaciones={destacarPublicaciones([...doce, pago, raro], '2026-10-28')} />)
      for (const nombre of [/con pauta/i, /fuera de lo normal/i]) {
        const lista = screen.getByRole('list', { name: nombre })
        const texto = within(lista).getByText(/^Texto larguísimo/)
        expect(texto.textContent!.length).toBeLessThanOrEqual(91)
        expect(texto.textContent).toMatch(/…$/)
      }
    })

    it('un texto corto queda entero', () => {
      const pago = base(95, { vistas: 5000, conPauta: true, texto: 'Corto' })
      render(<Destacados campanias={null} publicaciones={destacarPublicaciones([...doce, pago], '2026-10-28')} />)
      expect(within(screen.getByRole('list', { name: /con pauta/i })).getByText('Corto')).toBeInTheDocument()
    })
  })

  describe('posts sin métricas', () => {
    it('avisa cuántos no se comparan, solo si hay', () => {
      const { rerender } = render(<Destacados campanias={null} publicaciones={destacarPublicaciones([...doce, base(94, { vistas: 0 })], '2026-10-28')} />)
      expect(screen.getByText(/1 publicación sin métricas de Meta no se compara/i)).toBeInTheDocument()
      rerender(<Destacados campanias={null} publicaciones={destacarPublicaciones(doce, '2026-10-28')} />)
      expect(screen.queryByText(/sin métricas de Meta/i)).not.toBeInTheDocument()
    })
  })
})
