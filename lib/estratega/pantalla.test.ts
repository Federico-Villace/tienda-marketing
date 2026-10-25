import { describe, it, expect, vi } from 'vitest'
import { elegirPlan, leerRol, marcaIdsDeAnalisis, puedeEditarPlanes, rotuloAnalisis, ventanaPorDefecto } from './pantalla'
import { agruparPorRaiz } from './historial'
import type { PlanVista } from './tipos'
import type { AnalisisVista } from '../analista/historial'
import { MARCAS } from '../datos/marcas'

const v = (o: Partial<PlanVista>): PlanVista =>
  ({ id: 'p', raizId: 'a', padreId: null, version: 1, origen: 'agente', estado: 'borrador', brief: {} as never, plan: {} as never,
    analisisId: 'x', modelo: null, costoUsd: 0, creadoEn: '2026-10-20T10:00:00Z', aprobadoEn: null, desdeCache: false, ...o }) as PlanVista

describe('elegirPlan', () => {
  const grupos = agruparPorRaiz([
    v({ id: 'a1', raizId: 'a', version: 1, estado: 'reemplazado' }),
    v({ id: 'a2', raizId: 'a', version: 2, creadoEn: '2026-10-20T11:00:00Z' }),
    v({ id: 'b1', raizId: 'b', creadoEn: '2026-10-21T10:00:00Z' }),
  ])

  it('sin parámetros elige la raíz más reciente y su última versión', () => {
    const e = elegirPlan(grupos, {})!
    expect(e.grupo.raizId).toBe('b')
    expect(e.vista.id).toBe('b1')
    expect(e.esPunta).toBe(true)
  })

  it('?plan= elige la raíz y, sin v, la última versión', () => {
    const e = elegirPlan(grupos, { plan: 'a' })!
    expect(e.vista.id).toBe('a2')
    expect(e.esPunta).toBe(true)
  })

  it('?v= elige una versión vieja y deja de ser la punta', () => {
    const e = elegirPlan(grupos, { plan: 'a', v: '1' })!
    expect(e.vista.id).toBe('a1')
    expect(e.esPunta).toBe(false)
  })

  it('parámetros inventados caen a lo más reciente; sin planes es null', () => {
    expect(elegirPlan(grupos, { plan: 'zzz', v: 'abc' })!.vista.id).toBe('b1')
    expect(elegirPlan(grupos, { plan: 'a', v: '99' })!.vista.id).toBe('a2')
    expect(elegirPlan([], {})).toBeNull()
  })
})

describe('rotuloAnalisis', () => {
  it('lleva fecha, marca y período', () => {
    const a = {
      creadoEn: '2026-10-20T15:00:00Z',
      filtros: { marcaIds: [MARCAS[2]!.id], plataforma: 'todas', desde: '2026-09-21', hasta: '2026-10-20' },
    } as unknown as AnalisisVista
    const r = rotuloAnalisis(a)
    expect(r).toContain('Suzuki Quilmes')
    expect(r).toContain('2026-09-21 a 2026-10-20')
    expect(r).toMatch(/20 oct/i)
  })
})

describe('rotuloAnalisis con varias marcas', () => {
  const a = (marcaIds: string[]) =>
    ({ creadoEn: '2026-10-20T15:00:00Z', filtros: { marcaIds, plataforma: 'todas', desde: '2026-09-21', hasta: '2026-10-20' } }) as unknown as AnalisisVista

  it('usa el rótulo de varias marcas', () => {
    expect(rotuloAnalisis(a([MARCAS[2]!.id, MARCAS[5]!.id]))).toContain('Suzuki Quilmes y Zontes Quilmes')
    expect(rotuloAnalisis(a(MARCAS.map((m) => m.id)))).toContain('Todas las marcas')
  })

  it('marcaIdsDeAnalisis expone los ids en orden de MARCAS para preseleccionar el brief', () => {
    expect(marcaIdsDeAnalisis(a([MARCAS[5]!.id, MARCAS[2]!.id]))).toEqual([MARCAS[2]!.id, MARCAS[5]!.id])
  })
})

describe('ventanaPorDefecto', () => {
  it('arranca hoy (hora Argentina) y dura 4 semanas', () => {
    expect(ventanaPorDefecto(new Date('2026-10-20T15:00:00Z'))).toEqual({ desde: '2026-10-20', hasta: '2026-11-16' })
    // 01:00 UTC todavía es el día anterior en Argentina.
    expect(ventanaPorDefecto(new Date('2026-10-21T01:00:00Z')).desde).toBe('2026-10-20')
  })
})

describe('rol', () => {
  it('director y operador pueden; lector, sin rol o sin sesión no', () => {
    expect(puedeEditarPlanes('director')).toBe(true)
    expect(puedeEditarPlanes('operador')).toBe(true)
    expect(puedeEditarPlanes('lector')).toBe(false)
    expect(puedeEditarPlanes(null)).toBe(false)
  })

  it('leerRol consulta miembros por organización y usuario', async () => {
    const f = vi.fn<typeof fetch>(async () => Response.json([{ rol: 'operador' }]))
    expect(await leerRol({ url: 'https://x.supabase.co', secretKey: 'k' }, 'u-1', f)).toBe('operador')
    const url = new URL(String(f.mock.calls[0]![0]))
    expect(url.pathname).toBe('/rest/v1/miembros')
    expect(url.searchParams.get('usuario_id')).toBe('eq.u-1')
  })

  it('leerRol sin usuario o sin membresía es null (y sin usuario no consulta)', async () => {
    const f = vi.fn<typeof fetch>(async () => Response.json([]))
    expect(await leerRol({ url: 'https://x.supabase.co', secretKey: 'k' }, null, f)).toBeNull()
    expect(f).not.toHaveBeenCalled()
    expect(await leerRol({ url: 'https://x.supabase.co', secretKey: 'k' }, 'u-1', f)).toBeNull()
  })
})
