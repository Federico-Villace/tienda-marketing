import { describe, it, expect, vi } from 'vitest'
import { leerPiezas, leerTandas, vistaDePieza, vistaDeTanda, type FilaPieza, type FilaTanda } from './historial'
import { piezasDePrueba } from './fixture'

const S = { url: 'https://x.supabase.co', secretKey: 'k' }

const fila: FilaPieza = {
  id: 'pz1', raiz_id: 'pz1', padre_id: null, tanda_id: 't1', plan_id: 'p1', semana: 1, orden: 2, version: 1,
  origen: 'agente', estado: 'borrador', pieza: piezasDePrueba()[0]!, creado_en: '2026-10-20T10:00:00Z', aprobado_en: null,
}
const filaTanda: FilaTanda = {
  id: 't1', plan_id: 'p1', semana: 1, notas: null, modelo: 'gpt-6-luna', costo_usd: '0.0021', creado_en: '2026-10-20T10:00:00Z',
}

describe('vistas', () => {
  it('vistaDePieza mapea snake_case a camelCase', () => {
    expect(vistaDePieza(fila)).toMatchObject({ id: 'pz1', raizId: 'pz1', padreId: null, tandaId: 't1', planId: 'p1', orden: 2, aprobadoEn: null })
  })
  it('vistaDeTanda convierte el costo a número y lleva desdeCache', () => {
    expect(vistaDeTanda(filaTanda, true)).toMatchObject({ id: 't1', planId: 'p1', costoUsd: 0.0021, desdeCache: true })
    expect(vistaDeTanda(filaTanda).desdeCache).toBe(false)
  })
})

describe('leerTandas / leerPiezas', () => {
  it('leerTandas pide las tandas de esos planes, sin hash ni tokens', async () => {
    const f = vi.fn<typeof fetch>(async () => Response.json([filaTanda]))
    const r = await leerTandas(S, ['p1', 'p2'], f)
    const url = new URL(String(f.mock.calls[0]![0]))
    expect(url.pathname).toBe('/rest/v1/tandas_contenido')
    expect(url.searchParams.get('plan_id')).toBe('in.(p1,p2)')
    expect(url.searchParams.get('select')).not.toMatch(/hash|tokens/)
    expect(r[0]!.costoUsd).toBe(0.0021)
  })
  it('leerPiezas pide las piezas de esas tandas', async () => {
    const f = vi.fn<typeof fetch>(async () => Response.json([fila]))
    const r = await leerPiezas(S, ['t1'], f)
    const url = new URL(String(f.mock.calls[0]![0]))
    expect(url.pathname).toBe('/rest/v1/piezas')
    expect(url.searchParams.get('tanda_id')).toBe('in.(t1)')
    expect(r).toHaveLength(1)
  })
  it('sin ids no consulta', async () => {
    const f = vi.fn<typeof fetch>()
    expect(await leerTandas(S, [], f)).toEqual([])
    expect(await leerPiezas(S, [], f)).toEqual([])
    expect(f).not.toHaveBeenCalled()
  })
})
