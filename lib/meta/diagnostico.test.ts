import { describe, it, expect, vi } from 'vitest'
import { diagnosticarToken, huella } from './diagnostico'

const base = {
  appId: '2324064161428607',
  appSecret: 'secreto-de-la-app',
  version: 'v26.0',
  token: 'TOKEN-SECRETO-DE-VAULT',
  businessId: '155769225183739',
}

const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status })

/** Graph API falsa: responde por ruta; lo que no conoce es un error 100. */
function falsaGraph(rutas: Record<string, () => Response>) {
  return vi.fn<typeof fetch>(async (entrada) => {
    const url = new URL(String(entrada))
    const ruta = url.pathname.replace(/^\/v26\.0\//, '')
    return rutas[ruta]?.() ?? json({ error: { message: `sin ruta ${ruta}`, code: 100 } }, 400)
  })
}

const debugOk = () =>
  json({
    data: {
      type: 'SYSTEM_USER',
      app_id: base.appId,
      is_valid: true,
      expires_at: 0,
      data_access_expires_at: 0,
      scopes: ['instagram_basic'],
      granular_scopes: [{ scope: 'ads_read', target_ids: ['act_1', 'act_2'] }],
    },
  })

describe('diagnosticarToken', () => {
  it('nunca incluye el token en el informe', async () => {
    const f = falsaGraph({ debug_token: debugOk })
    const informe = await diagnosticarToken(base, f)
    expect(JSON.stringify(informe)).not.toContain(base.token)
    expect(JSON.stringify(informe)).not.toContain(base.appSecret)
  })

  it('usa el mismo token en todas las llamadas a Meta', async () => {
    const f = falsaGraph({ debug_token: debugOk })
    await diagnosticarToken(base, f)
    for (const [entrada] of f.mock.calls) {
      const url = new URL(String(entrada))
      const usado = url.searchParams.get('input_token') ?? url.searchParams.get('access_token')
      expect(usado).toBe(base.token)
    }
  })

  it('reporta los metadatos de debug_token, scopes y granular_scopes por separado', async () => {
    const informe = await diagnosticarToken(base, falsaGraph({ debug_token: debugOk }))
    const paso = informe.find((p) => p.paso === 'debug_token')!
    expect(paso.ok).toBe(true)
    expect(paso.datos).toMatchObject({
      tipo: 'SYSTEM_USER',
      app_id: base.appId,
      app_coincide: true,
      is_valid: true,
      vence: 'nunca',
      scopes: ['instagram_basic'],
      granular_scopes: [{ scope: 'ads_read', target_ids: 2 }],
    })
  })

  it('separa un error de consulta de una respuesta que confirma permisos ausentes', async () => {
    const f = falsaGraph({
      debug_token: debugOk,
      'me/permissions': () =>
        json({
          data: [
            { permission: 'instagram_basic', status: 'granted' },
            { permission: 'ads_read', status: 'declined' },
          ],
        }),
    })
    const informe = await diagnosticarToken(base, f)
    const permisos = informe.find((p) => p.paso === 'me/permissions')!
    expect(permisos.ok).toBe(true)
    expect(permisos.datos).toMatchObject({
      otorgados: ['instagram_basic'],
      no_otorgados: ['ads_read:declined'],
    })
  })

  it('registra código, subcódigo y mensaje de Meta y sigue con los demás pasos', async () => {
    const f = falsaGraph({
      debug_token: debugOk,
      [`${base.businessId}/owned_ad_accounts`]: () =>
        json(
          {
            error: {
              message: 'Requires business_management permission',
              type: 'OAuthException',
              code: 200,
              error_subcode: 2069007,
              fbtrace_id: 'Xyz',
            },
          },
          403,
        ),
      [`${base.businessId}`]: () => json({ id: base.businessId, name: '999 Motos BM' }),
    })
    const informe = await diagnosticarToken(base, f)

    const cuentas = informe.find((p) => p.paso === 'business/owned_ad_accounts')!
    expect(cuentas.ok).toBe(false)
    expect(cuentas.error).toEqual({
      codigo: 200,
      subcodigo: 2069007,
      tipo: 'OAuthException',
      mensaje: 'Requires business_management permission',
      fbtrace_id: 'Xyz',
    })
    expect(informe.find((p) => p.paso === 'business')!.ok).toBe(true)
  })

  it('prueba insights en la cuenta publicitaria pedida', async () => {
    const f = falsaGraph({
      debug_token: debugOk,
      'act_42/insights': () => json({ data: [{ spend: '10.5', impressions: '1000' }] }),
    })
    const informe = await diagnosticarToken({ ...base, adAccountId: 'act_42' }, f)
    const paso = informe.find((p) => p.paso === 'act_42/insights')!
    expect(paso.ok).toBe(true)
    expect(paso.datos).toEqual({ filas: 1 })
  })

  it('sin cuenta pedida, usa la primera de granular_scopes de ads_read', async () => {
    const f = falsaGraph({ debug_token: debugOk })
    const informe = await diagnosticarToken(base, f)
    expect(informe.some((p) => p.paso === 'act_1/insights')).toBe(true)
  })
})

describe('huella', () => {
  it('es corta, estable y no revela el token', async () => {
    const h = await huella('abc')
    expect(h).toMatch(/^[0-9a-f]{12}$/)
    expect(await huella('abc')).toBe(h)
    expect(await huella('abd')).not.toBe(h)
  })
})
