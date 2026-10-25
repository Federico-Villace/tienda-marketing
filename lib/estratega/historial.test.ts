import { describe, it, expect, vi } from 'vitest'
import { agruparPorRaiz, leerPlanes, vistaDeFila, type FilaPlan } from './historial'
import type { PlanVista } from './tipos'

const v = (o: Partial<PlanVista>): PlanVista =>
  ({
    id: 'p', raizId: 'r1', padreId: null, version: 1, origen: 'agente', estado: 'borrador',
    brief: {} as never, plan: {} as never, analisisId: 'a', modelo: 'gpt-6-luna', costoUsd: 0,
    creadoEn: '2026-10-20T10:00:00Z', aprobadoEn: null, desdeCache: false, ...o,
  }) as PlanVista

describe('agruparPorRaiz', () => {
  it('agrupa por raíz, ordena versiones de la más nueva a la más vieja y elige la punta', () => {
    const g = agruparPorRaiz([
      v({ id: 'a1', raizId: 'a', version: 1, estado: 'reemplazado' }),
      v({ id: 'a2', raizId: 'a', version: 2, creadoEn: '2026-10-20T11:00:00Z' }),
      v({ id: 'b1', raizId: 'b', version: 1, creadoEn: '2026-10-21T10:00:00Z' }),
    ])
    expect(g.map((x) => x.raizId)).toEqual(['b', 'a'])
    const a = g[1]!
    expect(a.versiones.map((x) => x.version)).toEqual([2, 1])
    expect(a.punta.id).toBe('a2')
  })

  it('vigente es el aprobado de la raíz aunque la punta sea un borrador nuevo', () => {
    const [g] = agruparPorRaiz([
      v({ id: 'a1', version: 1, estado: 'aprobado', aprobadoEn: '2026-10-20T10:30:00Z' }),
      v({ id: 'a2', version: 2, estado: 'borrador', origen: 'edicion' }),
    ])
    expect(g!.punta.id).toBe('a2')
    expect(g!.vigente?.id).toBe('a1')
  })

  it('sin aprobado no hay vigente; lista vacía da lista vacía', () => {
    expect(agruparPorRaiz([v({})])[0]!.vigente).toBeNull()
    expect(agruparPorRaiz([])).toEqual([])
  })
})

describe('vistaDeFila / leerPlanes', () => {
  const fila: FilaPlan = {
    id: 'p1', raiz_id: 'p1', padre_id: null, version: 1, origen: 'agente', estado: 'borrador',
    analisis_id: 'a1', brief: { objetivo: 'x' } as never, plan: { objetivo: 'y' } as never,
    modelo: 'gpt-6-luna', costo_usd: '0.0021', creado_en: '2026-10-20T10:00:00Z', aprobado_en: null,
  }

  it('mapea snake_case a camelCase y convierte el costo a número', () => {
    expect(vistaDeFila(fila, true)).toMatchObject({
      id: 'p1', raizId: 'p1', padreId: null, analisisId: 'a1', costoUsd: 0.0021, aprobadoEn: null, desdeCache: true,
    })
  })

  it('lectura tolerante: las piezas de un plan viejo (sin marca) quedan con marca null; las nuevas conservan la suya', () => {
    const plan = { calendario: [{ semana: 1, eje: 'e', piezas: [{ plataforma: 'instagram', formato: 'reel', cantidad: 1, idea: 'a' }, { plataforma: 'instagram', formato: 'reel', cantidad: 1, idea: 'b', marca: 'Zontes Quilmes' }] }] }
    const v = vistaDeFila({ ...fila, plan: plan as never })
    expect(v.plan.calendario[0]!.piezas.map((z) => z.marca)).toEqual([null, 'Zontes Quilmes'])
  })

  it('lee de la organización pedida, sin columnas de hash ni tokens', async () => {
    const f = vi.fn<typeof fetch>(async () => Response.json([fila]))
    const r = await leerPlanes({ url: 'https://x.supabase.co', secretKey: 'k' }, 'org-1', 30, f)
    const url = new URL(String(f.mock.calls[0]![0]))
    expect(url.pathname).toBe('/rest/v1/planes')
    expect(url.searchParams.get('organizacion_id')).toBe('eq.org-1')
    expect(url.searchParams.get('limit')).toBe('30')
    expect(url.searchParams.get('select')).not.toMatch(/hash|tokens/)
    expect(r).toHaveLength(1)
  })
})
