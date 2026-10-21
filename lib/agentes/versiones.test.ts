import { describe, it, expect } from 'vitest'
import { agruparPorRaiz } from './versiones'

type X = { id: string; raizId: string; version: number; estado: string; creadoEn: string }
const x = (o: Partial<X>): X => ({ id: 'i', raizId: 'a', version: 1, estado: 'borrador', creadoEn: '2026-10-20T10:00:00Z', ...o })

describe('agruparPorRaiz genérico', () => {
  it('dos grupos, versión más alta primero y punta', () => {
    const g = agruparPorRaiz([
      x({ id: 'a1', raizId: 'A', version: 1 }),
      x({ id: 'a2', raizId: 'A', version: 2, creadoEn: '2026-10-20T11:00:00Z' }),
      x({ id: 'b1', raizId: 'B', version: 1, creadoEn: '2026-10-21T10:00:00Z' }),
    ])
    expect(g.map((r) => r.raizId)).toEqual(['B', 'A'])
    expect(g[1]!.versiones.map((v) => v.version)).toEqual([2, 1])
    expect(g[1]!.punta.id).toBe('a2')
  })

  it('vigente por defecto es estado "aprobado"', () => {
    const [g] = agruparPorRaiz([x({ id: 'a1', estado: 'aprobado' }), x({ id: 'a2', version: 2 })])
    expect(g!.vigente?.id).toBe('a1')
  })

  it('esVigente permite otro criterio (aprobada)', () => {
    const [g] = agruparPorRaiz([x({ id: 'a1', estado: 'aprobada' })], (r) => r.estado === 'aprobada')
    expect(g!.vigente?.id).toBe('a1')
    expect(agruparPorRaiz([x({})])[0]!.vigente).toBeNull()
  })

  it('lista vacía', () => expect(agruparPorRaiz([])).toEqual([]))
})
