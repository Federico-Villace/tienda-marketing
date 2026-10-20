import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { Versiones } from './versiones'
import { agruparPorRaiz } from '@/lib/estratega/historial'
import type { PlanVista } from '@/lib/estratega/tipos'

const v = (o: Partial<PlanVista>): PlanVista =>
  ({
    id: 'p', raizId: 'a', padreId: null, version: 1, origen: 'agente', estado: 'borrador',
    brief: { objetivo: 'Objetivo A', marcas: ['Zontes Quilmes'] } as never, plan: {} as never, analisisId: 'x',
    modelo: 'gpt-6-luna', costoUsd: 0.0021, creadoEn: '2026-10-20T10:00:00Z', aprobadoEn: null, desdeCache: false, ...o,
  }) as PlanVista

describe('Versiones (S43)', () => {
  const grupos = agruparPorRaiz([
    v({ id: 'a1', version: 1, estado: 'reemplazado' }),
    v({ id: 'a2', version: 2, origen: 'edicion', costoUsd: 0, creadoEn: '2026-10-20T11:00:00Z' }),
    v({ id: 'b1', raizId: 'b', brief: { objetivo: 'Objetivo B', marcas: [] } as never, creadoEn: '2026-10-19T10:00:00Z' }),
  ])

  it('lista las versiones del grupo con versión, origen y estado, y la elegida marcada', () => {
    render(<Versiones grupos={grupos} raizActual="a" versionActual={2} />)
    const lista = screen.getByRole('list', { name: /versiones/i })
    const items = within(lista).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('v2')
    expect(items[0]).toHaveTextContent(/edición/i)
    expect(items[0]).toHaveTextContent(/borrador/i)
    expect(items[0]).toHaveTextContent('US$ 0,0000')
    expect(items[1]).toHaveTextContent('v1')
    expect(items[1]).toHaveTextContent(/agente/i)
    expect(items[1]).toHaveTextContent(/reemplazado/i)
    expect(within(items[0]!).getByRole('link')).toHaveAttribute('aria-current', 'true')
  })

  it('cada versión linkea a ?plan=raiz&v=n', () => {
    render(<Versiones grupos={grupos} raizActual="a" versionActual={2} />)
    expect(screen.getByRole('link', { name: /v1/ })).toHaveAttribute('href', '/campanas?plan=a&v=1')
  })

  it('las otras raíces se listan abajo con su objetivo', () => {
    render(<Versiones grupos={grupos} raizActual="a" versionActual={2} />)
    const otro = screen.getByRole('link', { name: /Objetivo B/ })
    expect(otro).toHaveAttribute('href', '/campanas?plan=b')
  })
})
