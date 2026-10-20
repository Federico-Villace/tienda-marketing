import { describe, it, expect, vi } from 'vitest'
import { listarMediaIg, listarPaginas, listarPostsFb } from './meta-organico'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const sinEsperar = async () => {}

const urls = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map(([u]) => new URL(String(u)))

describe('listarPaginas', () => {
  it('pide me/accounts con el token del bot y la versión configurada', async () => {
    const f = vi.fn<typeof fetch>(async () => json({ data: [{ id: 'p1', name: 'P', access_token: 'PT' }] }))
    const r = await listarPaginas({ version: 'v99.0', token: 'BT' }, f, sinEsperar)
    const [u] = urls(f)
    expect(u!.pathname).toBe('/v99.0/me/accounts')
    expect(u!.searchParams.get('access_token')).toBe('BT')
    expect(u!.searchParams.get('fields')).toBe('id,name,access_token,instagram_business_account{id,username}')
    expect(u!.searchParams.get('limit')).toBe('100')
    expect(r).toHaveLength(1)
  })
})

describe('listarMediaIg', () => {
  const m = { version: 'v26.0', token: 'BT', ig: '1784', desde: '2026-07-23' }

  it('pide {ig}/media con since 90d, insights sin impressions y el token del bot', async () => {
    const f = vi.fn<typeof fetch>(async () => json({ data: [] }))
    await listarMediaIg(m, f, sinEsperar)
    const [u] = urls(f)
    expect(u!.pathname).toBe('/v26.0/1784/media')
    expect(u!.searchParams.get('since')).toBe('2026-07-23')
    expect(u!.searchParams.get('access_token')).toBe('BT')
    const fields = u!.searchParams.get('fields')!
    expect(fields).toContain('insights.metric(views,reach,likes,comments,shares,saved)')
    expect(fields).not.toContain('impressions')
  })

  it('junta las dos páginas', async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: [{ id: 'a' }], paging: { next: 'https://graph.facebook.com/v26.0/1784/media?after=X' } }))
      .mockResolvedValueOnce(json({ data: [{ id: 'b' }] }))
    const r = await listarMediaIg(m, f, sinEsperar)
    expect(r.map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('reintenta con backoff ante un error de cuota', async () => {
    const esperar = vi.fn(async () => {})
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ error: { message: 'límite', code: 4 } }, 400))
      .mockResolvedValueOnce(json({ data: [{ id: 'a' }] }))
    const r = await listarMediaIg(m, f, esperar)
    expect(r).toHaveLength(1)
    expect(esperar).toHaveBeenCalledTimes(1)
  })
})

describe('listarPostsFb', () => {
  const m = { version: 'v26.0', token: 'PT', pagina: '999', desde: '2026-07-23' }

  it('usa el page token, nunca el del bot, y las métricas válidas en v26', async () => {
    const f = vi.fn<typeof fetch>(async () => json({ data: [] }))
    await listarPostsFb(m, f, sinEsperar)
    const [u] = urls(f)
    expect(u!.pathname).toBe('/v26.0/999/posts')
    expect(u!.searchParams.get('access_token')).toBe('PT')
    expect(u!.toString()).not.toContain('BT')
    const fields = u!.searchParams.get('fields')!
    expect(fields).toContain('insights.metric(post_media_view,post_reactions_by_type_total,post_clicks)')
    expect(fields).toContain('reactions.summary(total_count).limit(0)')
    expect(fields).not.toContain('post_impressions')
    expect(fields).not.toContain('post_engaged_users')
    expect(u!.searchParams.get('since')).toBe('2026-07-23')
  })

  it('pagina', async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: [{ id: 'a' }], paging: { next: 'https://graph.facebook.com/v26.0/999/posts?after=X' } }))
      .mockResolvedValueOnce(json({ data: [{ id: 'b' }] }))
    expect(await listarPostsFb(m, f, sinEsperar)).toHaveLength(2)
  })
})
