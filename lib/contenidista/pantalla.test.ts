import { describe, it, expect } from 'vitest'
import { elegirPlanContenido, gruposDeTanda, planDesactualizado, planesConContenido, tandasDeSemana, ultimaTandaPorSemana } from './pantalla'
import type { PiezaVista, TandaVista } from './tipos'
import type { PlanVista } from '../estratega/tipos'
import { piezasDePrueba } from './fixture'

const plan = (o: Partial<PlanVista>): PlanVista => ({ id: 'p', raizId: 'r', estado: 'aprobado', aprobadoEn: '2026-10-20T10:00:00Z', creadoEn: '2026-10-20T09:00:00Z', ...o }) as PlanVista
const tanda = (o: Partial<TandaVista>): TandaVista => ({ id: 't', planId: 'p', semana: 1, notas: null, modelo: 'm', costoUsd: 0, creadoEn: '2026-10-21T10:00:00Z', desdeCache: false, ...o })
const pieza = (o: Partial<PiezaVista>): PiezaVista =>
  ({ id: 'z', raizId: 'z', padreId: null, version: 1, origen: 'agente', estado: 'borrador', tandaId: 't', planId: 'p', semana: 1, orden: 1, pieza: piezasDePrueba()[0]!, creadoEn: '2026-10-21T10:00:00Z', aprobadoEn: null, ...o })

describe('planesConContenido (S47)', () => {
  it('lista los aprobados y los que ya tienen tandas; no los borradores ni descartados sin contenido', () => {
    const r = planesConContenido(
      [plan({ id: 'a' }), plan({ id: 'b', estado: 'borrador' }), plan({ id: 'c', estado: 'reemplazado' }), plan({ id: 'd', estado: 'descartado' })],
      [tanda({ planId: 'c' })],
    )
    expect(r.map((p) => p.id)).toEqual(['a', 'c'])
  })
  it('sin planes aprobados, lista vacía', () => {
    expect(planesConContenido([plan({ estado: 'borrador' })], [])).toEqual([])
  })
})

describe('elegirPlanContenido', () => {
  const lista = [plan({ id: 'viejo', aprobadoEn: '2026-10-10T10:00:00Z' }), plan({ id: 'nuevo', aprobadoEn: '2026-10-20T10:00:00Z' })]
  it('?plan= si existe; si no, el aprobado más reciente', () => {
    expect(elegirPlanContenido(lista, 'viejo')?.id).toBe('viejo')
    expect(elegirPlanContenido(lista, 'inventado')?.id).toBe('nuevo')
    expect(elegirPlanContenido(lista, undefined)?.id).toBe('nuevo')
    expect(elegirPlanContenido([], undefined)).toBeNull()
  })
})

describe('S45-S46 planDesactualizado', () => {
  it('es verdadero cuando el plan ya no es el aprobado; falso si es el vigente', () => {
    expect(planDesactualizado('reemplazado')).toBe(true)
    expect(planDesactualizado('descartado')).toBe(true)
    expect(planDesactualizado('aprobado')).toBe(false)
  })
})

describe('tandas por semana', () => {
  const ts = [tanda({ id: 'a', creadoEn: '2026-10-21T10:00:00Z' }), tanda({ id: 'b', creadoEn: '2026-10-22T10:00:00Z' }), tanda({ id: 'c', semana: 2 })]
  it('ultimaTandaPorSemana elige la más nueva de cada semana', () => {
    const m = ultimaTandaPorSemana(ts)
    expect(m.get(1)?.id).toBe('b')
    expect(m.get(2)?.id).toBe('c')
  })
  it('tandasDeSemana las ordena de la más nueva a la más vieja', () => {
    expect(tandasDeSemana(ts, 1).map((t) => t.id)).toEqual(['b', 'a'])
  })
})

describe('gruposDeTanda', () => {
  it('agrupa las versiones por raíz, ordenadas por orden, con la aprobada como vigente', () => {
    const g = gruposDeTanda(
      [
        pieza({ id: 'z2', raizId: 'z2', orden: 2 }),
        pieza({ id: 'z1a', raizId: 'z1', orden: 1, estado: 'aprobada', aprobadoEn: 'x' }),
        pieza({ id: 'z1b', raizId: 'z1', orden: 1, version: 2, origen: 'edicion', creadoEn: '2026-10-21T11:00:00Z' }),
        pieza({ id: 'otra', tandaId: 'otra', orden: 1 }),
      ],
      't',
    )
    expect(g.map((x) => x.raizId)).toEqual(['z1', 'z2'])
    expect(g[0]!.punta.id).toBe('z1b')
    expect(g[0]!.vigente?.id).toBe('z1a')
  })
})
