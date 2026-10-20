import { describe, it, expect, vi } from 'vitest'
import { manejarSync } from './endpoint'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'

const entorno = {
  CRON_SECRET: 'secreto-del-cron',
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_xyz',
  META_API_VERSION: 'v26.0',
}

const pedido = (auth?: string) =>
  new Request('https://app.ejemplo.com/api/sync', auth ? { headers: { authorization: auth } } : {})

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })

/** Vault devuelve el token; el resto lo resuelve la sincronización (falsa). */
const vault = (token: string | null = 'TOKEN-VAULT') =>
  vi.fn<typeof fetch>(async (u) => {
    if (String(u).includes('/rpc/leer_token_meta')) return json(token)
    throw new Error(`URL inesperada: ${u}`)
  })

describe('manejarSync', () => {
  it('sin CRON_SECRET configurado no corre nunca', async () => {
    const { CRON_SECRET: _, ...sin } = entorno
    const r = await manejarSync(pedido('Bearer cualquiera'), sin, vault(), vi.fn())
    expect(r.status).toBe(500)
  })

  it.each([undefined, 'Bearer otro', 'secreto-del-cron'])('rechaza la autorización %s', async (auth) => {
    const sincronizar = vi.fn()
    const r = await manejarSync(pedido(auth), entorno, vault(), sincronizar)
    expect(r.status).toBe(401)
    expect(sincronizar).not.toHaveBeenCalled()
  })

  it('lee el token de Vault y sincroniza la organización piloto', async () => {
    const sincronizar = vi.fn(async () => ({ estado: 'ok' as const, filas: 7, cuentas: [] }))
    const r = await manejarSync(pedido('Bearer secreto-del-cron'), entorno, vault(), sincronizar)

    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ estado: 'ok', filas: 7, cuentas: [] })
    expect(sincronizar).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: { version: 'v26.0', token: 'TOKEN-VAULT' },
        organizacionId: ORGANIZACION_PILOTO_ID,
      }),
    )
  })

  it('una corrida con errores responde 502 con el detalle, sin el token', async () => {
    const sincronizar = vi.fn(async () => ({ estado: 'error' as const, filas: 0, cuentas: [], error: '(#190) x' }))
    const r = await manejarSync(pedido('Bearer secreto-del-cron'), entorno, vault(), sincronizar)
    expect(r.status).toBe(502)
    expect(await r.text()).not.toContain('TOKEN-VAULT')
  })

  it('una corrida parcial (algunas cuentas cargaron) responde 200 con el detalle', async () => {
    const sincronizar = vi.fn(async () => ({ estado: 'parcial' as const, filas: 5, cuentas: [], error: 'act_1: (#200) x' }))
    const r = await manejarSync(pedido('Bearer secreto-del-cron'), entorno, vault(), sincronizar)
    expect(r.status).toBe(200)
    expect((await r.json()).estado).toBe('parcial')
  })

  it('si Vault está vacío avisa que falta cargar el token', async () => {
    const r = await manejarSync(pedido('Bearer secreto-del-cron'), entorno, vault(null), vi.fn())
    expect(r.status).toBe(503)
    expect((await r.json()).error).toMatch(/guardar-token-meta/)
  })
})
