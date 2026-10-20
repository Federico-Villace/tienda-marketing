import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const sincronizarOrganico = vi.fn(async () => ({ estado: 'ok' as const, filas: 3, cuentas: [] }))
vi.mock('@/lib/ingesta/sincronizar-organico', () => ({ sincronizarOrganico }))

const { GET, maxDuration } = await import('./route')

const pedido = (auth?: string) =>
  new Request('https://app.ejemplo.com/api/sync-organico', auth ? { headers: { authorization: auth } } : {})

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'secreto-del-cron')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co')
  vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_xyz')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (u: unknown) => {
      if (String(u).includes('/rpc/leer_token_meta')) return new Response(JSON.stringify('TOKEN-VAULT'))
      throw new Error(`URL inesperada: ${u}`)
    }),
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  sincronizarOrganico.mockClear()
})

describe('GET /api/sync-organico', () => {
  it.each([undefined, 'Bearer otro', 'secreto-del-cron'])('rechaza la autorización %s con 401 y no ejecuta', async (auth) => {
    const r = await GET(pedido(auth))
    expect(r.status).toBe(401)
    expect(sincronizarOrganico).not.toHaveBeenCalled()
  })

  it('sin CRON_SECRET configurado no corre nunca', async () => {
    vi.stubEnv('CRON_SECRET', '')
    const r = await GET(pedido('Bearer '))
    expect(r.status).toBeGreaterThanOrEqual(400)
    expect(sincronizarOrganico).not.toHaveBeenCalled()
  })

  it('con el Bearer correcto sincroniza y responde el resumen', async () => {
    const r = await GET(pedido('Bearer secreto-del-cron'))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ estado: 'ok', filas: 3, cuentas: [] })
    expect(sincronizarOrganico).toHaveBeenCalledOnce()
  })

  it('declara 300 s: con reintentos por cuota la corrida tarda', () => {
    expect(maxDuration).toBe(300)
  })
})
