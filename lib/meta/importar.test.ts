import { describe, it, expect, vi } from 'vitest'
import { importarToken } from './importar'

const entrada = {
  token: 'TOKEN-DEL-BOT',
  appId: '2324064161428607',
  appSecret: 'secreto-de-la-app',
  version: 'v26.0',
  businessId: '155769225183739',
  supabaseUrl: 'https://abc.supabase.co',
  secretKey: 'sb_secret_xyz',
}

const TODOS = ['instagram_basic', 'instagram_manage_insights', 'pages_read_engagement', 'ads_read']

function falsaMeta(o: { valido?: boolean; appId?: string; scopes?: string[]; negocio?: boolean } = {}) {
  const { valido = true, appId = entrada.appId, scopes = TODOS, negocio = true } = o
  const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
  return vi.fn<typeof fetch>(async (e) => {
    const url = new URL(String(e))
    if (url.hostname === 'abc.supabase.co') return new Response(null, { status: 204 })
    if (url.pathname.endsWith('/debug_token')) {
      return json({
        data: { type: 'SYSTEM_USER', app_id: appId, is_valid: valido, expires_at: 0, scopes },
      })
    }
    if (url.pathname.endsWith(`/${entrada.businessId}`)) {
      return negocio ? json({ id: entrada.businessId }) : json({ error: { message: 'no', code: 100 } }, 400)
    }
    throw new Error(`URL inesperada: ${url}`)
  })
}

const guardado = (f: ReturnType<typeof falsaMeta>) => {
  const llamada = f.mock.calls.find(([u]) => String(u).includes('/rpc/guardar_token_meta'))
  return llamada ? JSON.parse(String(llamada[1]?.body)).p_token : undefined
}

describe('importarToken', () => {
  it('valida el token y lo guarda en Vault', async () => {
    const f = falsaMeta()
    const r = await importarToken(entrada, f)
    expect(r).toMatchObject({ ok: true, tipo: 'SYSTEM_USER', vence: 'nunca' })
    expect(guardado(f)).toBe('TOKEN-DEL-BOT')
  })

  it('nunca devuelve el token en el resultado', async () => {
    const r = await importarToken(entrada, falsaMeta())
    expect(JSON.stringify(r)).not.toContain('TOKEN-DEL-BOT')
  })

  it.each([
    ['inválido', { valido: false }],
    ['de otra app', { appId: '999' }],
  ])('rechaza un token %s sin guardar', async (_, o) => {
    const f = falsaMeta(o)
    const r = await importarToken(entrada, f)
    expect(r).toMatchObject({ ok: false, motivo: 'token_invalido' })
    expect(guardado(f)).toBeUndefined()
  })

  it('rechaza si le faltan permisos del MVP y dice cuáles', async () => {
    const f = falsaMeta({ scopes: ['instagram_basic'] })
    const r = await importarToken(entrada, f)
    expect(r).toMatchObject({ ok: false, motivo: 'permisos_insuficientes' })
    expect(r.ok === false && r.faltan).toContain('ads_read')
    expect(guardado(f)).toBeUndefined()
  })

  it('rechaza si no ve el Business del cliente', async () => {
    const f = falsaMeta({ negocio: false })
    const r = await importarToken(entrada, f)
    expect(r).toMatchObject({ ok: false, motivo: 'sin_acceso_negocio' })
    expect(guardado(f)).toBeUndefined()
  })
})
