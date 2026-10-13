import { describe, it, expect, vi } from 'vitest'
import { insightsDiarios, listarCampanias, listarCuentasPublicitarias, todasLasPaginas } from './meta-ads'
import { ErrorMeta } from '../meta/oauth'

const m = { version: 'v26.0', token: 'TOKEN' }
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const sinEspera = vi.fn(async (_ms: number) => {})

describe('todasLasPaginas', () => {
  it('sigue paging.next hasta el final', async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: [1, 2], paging: { next: 'https://graph.facebook.com/v26.0/x?after=b' } }))
      .mockResolvedValueOnce(json({ data: [3] }))
    const datos = await todasLasPaginas<number>(new URL('https://graph.facebook.com/v26.0/x'), f, sinEspera)
    expect(datos).toEqual([1, 2, 3])
    expect(String(f.mock.calls[1]![0])).toContain('after=b')
  })

  it('reintenta con espera creciente si Meta corta por cuota (código 17)', async () => {
    const esperar = vi.fn(async (_ms: number) => {})
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ error: { message: 'User request limit reached', code: 17 } }, 400))
      .mockResolvedValueOnce(json({ error: { message: 'Application request limit reached', code: 4 } }, 400))
      .mockResolvedValueOnce(json({ data: ['ok'] }))
    expect(await todasLasPaginas(new URL('https://graph.facebook.com/v26.0/x'), f, esperar)).toEqual(['ok'])
    expect(esperar).toHaveBeenCalledTimes(2)
    const [primera, segunda] = esperar.mock.calls.map(([ms]) => ms)
    expect(segunda!).toBeGreaterThan(primera!)
  })

  it('se rinde después de 3 reintentos', async () => {
    const f = vi.fn<typeof fetch>(async () => json({ error: { message: 'limit', code: 17 } }, 400))
    await expect(
      todasLasPaginas(new URL('https://graph.facebook.com/v26.0/x'), f, sinEspera),
    ).rejects.toBeInstanceOf(ErrorMeta)
    expect(f).toHaveBeenCalledTimes(4)
  })

  it('un error que no es de cuota no se reintenta', async () => {
    const f = vi.fn<typeof fetch>(async () => json({ error: { message: 'Missing Permissions', code: 200 } }, 403))
    await expect(
      todasLasPaginas(new URL('https://graph.facebook.com/v26.0/x'), f, sinEspera),
    ).rejects.toMatchObject({ codigo: 200 })
    expect(f).toHaveBeenCalledTimes(1)
  })
})

describe('consultas a la Marketing API', () => {
  const capturar = () => vi.fn<typeof fetch>(async () => json({ data: [] }))
  const url = (f: ReturnType<typeof capturar>) => new URL(String(f.mock.calls[0]![0]))

  it('listarCuentasPublicitarias usa me/adaccounts, que solo pide ads_read', async () => {
    const f = capturar()
    await listarCuentasPublicitarias(m, f, sinEspera)
    expect(url(f).pathname).toBe('/v26.0/me/adaccounts')
    expect(url(f).searchParams.get('fields')).toContain('currency')
    expect(url(f).searchParams.get('access_token')).toBe('TOKEN')
  })

  it('listarCampanias pide las campañas de la cuenta', async () => {
    const f = capturar()
    await listarCampanias({ ...m, cuenta: 'act_1' }, f, sinEspera)
    expect(url(f).pathname).toBe('/v26.0/act_1/campaigns')
    expect(url(f).searchParams.get('fields')).toContain('effective_status')
  })

  it('insightsDiarios pide grano diario a nivel campaña en el rango', async () => {
    const f = capturar()
    await insightsDiarios({ ...m, cuenta: 'act_1', desde: '2026-07-16', hasta: '2026-10-13' }, f, sinEspera)
    const u = url(f)
    expect(u.pathname).toBe('/v26.0/act_1/insights')
    expect(u.searchParams.get('level')).toBe('campaign')
    expect(u.searchParams.get('time_increment')).toBe('1')
    expect(JSON.parse(u.searchParams.get('time_range')!)).toEqual({ since: '2026-07-16', until: '2026-10-13' })
    expect(u.searchParams.get('fields')).toContain('actions')
  })
})
