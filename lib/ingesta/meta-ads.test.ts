import { describe, it, expect, vi } from 'vitest'
import { insightsDiarios, listarAnuncios, listarCampanias, listarCuentasPublicitarias, todasLasPaginas } from './meta-ads'
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

describe('listarAnuncios', () => {
  const ESTADOS = [
    'ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'ARCHIVED', 'DELETED',
    'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW', 'DISAPPROVED', 'PREAPPROVED', 'PENDING_BILLING_INFO',
  ]
  const cuenta = { ...m, cuenta: 'act_1' }

  it('pide {act}/ads con los campos del creativo, 500 por página y todos los estados', async () => {
    const f = vi.fn<typeof fetch>(async () => json({ data: [] }))
    await listarAnuncios(cuenta, f, sinEspera)
    const u = new URL(String(f.mock.calls[0]![0]))
    expect(u.pathname).toBe('/v26.0/act_1/ads')
    expect(u.searchParams.get('fields')).toBe(
      'id,name,campaign_id,adset_id,effective_status,created_time,updated_time,creative{effective_object_story_id,object_story_id,effective_instagram_media_id}',
    )
    expect(u.searchParams.get('limit')).toBe('500')
    expect(JSON.parse(u.searchParams.get('effective_status')!)).toEqual(ESTADOS)
    expect(u.searchParams.get('access_token')).toBe('TOKEN')
  })

  it('usa la versión que recibe, no una fija', async () => {
    const f = vi.fn<typeof fetch>(async () => json({ data: [] }))
    await listarAnuncios({ ...cuenta, version: 'v30.0' }, f, sinEspera)
    expect(new URL(String(f.mock.calls[0]![0])).pathname).toBe('/v30.0/act_1/ads')
  })

  it('pagina y devuelve la unión', async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: [{ id: '1' }], paging: { next: 'https://graph.facebook.com/v26.0/act_1/ads?after=b' } }))
      .mockResolvedValueOnce(json({ data: [{ id: '2' }] }))
    expect(await listarAnuncios(cuenta, f, sinEspera)).toEqual([{ id: '1' }, { id: '2' }])
  })

  it('si Meta responde error 100 con el filtro, reintenta UNA vez sin effective_status', async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ error: { message: 'Invalid parameter', code: 100 } }, 400))
      .mockResolvedValueOnce(json({ data: [{ id: '9' }] }))
    expect(await listarAnuncios(cuenta, f, sinEspera)).toEqual([{ id: '9' }])
    expect(f).toHaveBeenCalledTimes(2)
    expect(new URL(String(f.mock.calls[0]![0])).searchParams.has('effective_status')).toBe(true)
    const segunda = new URL(String(f.mock.calls[1]![0]))
    expect(segunda.searchParams.has('effective_status')).toBe(false)
    expect(segunda.searchParams.get('fields')).toContain('creative{')
  })

  it('si el reintento sin filtro también falla, el error sube (no insiste)', async () => {
    const f = vi.fn<typeof fetch>(async () => json({ error: { message: 'Invalid parameter', code: 100 } }, 400))
    await expect(listarAnuncios(cuenta, f, sinEspera)).rejects.toMatchObject({ codigo: 100 })
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('otro error no degrada: sube sin reintentar sin filtro', async () => {
    const f = vi.fn<typeof fetch>(async () => json({ error: { message: 'Missing Permissions', code: 200 } }, 403))
    await expect(listarAnuncios(cuenta, f, sinEspera)).rejects.toMatchObject({ codigo: 200 })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('ante cuota (17) espera y reintenta con el mismo filtro', async () => {
    const esperar = vi.fn(async (_ms: number) => {})
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ error: { message: 'limit', code: 17 } }, 400))
      .mockResolvedValueOnce(json({ data: [{ id: '1' }] }))
    expect(await listarAnuncios(cuenta, f, esperar)).toEqual([{ id: '1' }])
    expect(esperar).toHaveBeenCalledTimes(1)
    expect(new URL(String(f.mock.calls[1]![0])).searchParams.has('effective_status')).toBe(true)
  })
})
