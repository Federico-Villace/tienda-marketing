import { describe, it, expect, vi } from 'vitest'
import { sincronizarPublicidad } from './sincronizar'

const SUPA = 'https://abc.supabase.co'
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })

type Opciones = { cuentas?: unknown[]; falla?: Record<string, unknown> }

/** Meta y Supabase falsos. Supabase devuelve ids derivados y registra lo escrito. */
function mundo({ cuentas, falla = {} }: Opciones = {}) {
  const escrito: Record<string, any[]> = {}
  const cambios: { tabla: string; donde: string; cuerpo: any }[] = []

  const f = vi.fn<typeof fetch>(async (entrada, init) => {
    const url = new URL(String(entrada))
    if (url.origin === SUPA) {
      const tabla = url.pathname.replace('/rest/v1/', '')
      const cuerpo = init?.body ? JSON.parse(String(init.body)) : undefined
      if (init?.method === 'PATCH') {
        cambios.push({ tabla, donde: url.search, cuerpo })
        return new Response(null, { status: 204 })
      }
      const filas = Array.isArray(cuerpo) ? cuerpo : [cuerpo]
      ;(escrito[tabla] ??= []).push(...filas)
      return json(
        filas.map((x: any) => ({
          ...x,
          id: `${tabla}:${x.meta_id ?? x.meta_campaign_id ?? x.fecha ?? 'nueva'}`,
        })),
        201,
      )
    }

    const ruta = url.pathname.replace('/v26.0/', '')
    if (falla[ruta]) return json(falla[ruta], 400)
    if (ruta === 'me/adaccounts') {
      return json({ data: cuentas ?? [{ id: 'act_1', name: '999 MOTOS', currency: 'ARS' }] })
    }
    if (ruta.endsWith('/campaigns')) {
      return json({
        data: [
          { id: 'c-activa', name: 'Activa', effective_status: 'ACTIVE' },
          { id: 'c-con-datos', name: 'Pausada con datos', effective_status: 'PAUSED' },
          { id: 'c-vieja', name: 'Pausada sin datos', effective_status: 'PAUSED' },
        ],
      })
    }
    if (ruta.endsWith('/insights')) {
      return json({
        data: [
          { campaign_id: 'c-con-datos', date_start: '2026-10-01', spend: '100', impressions: '1000', clicks: '10' },
          { campaign_id: 'c-borrada', campaign_name: 'Borrada', date_start: '2026-10-02', spend: '50' },
        ],
      })
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, escrito, cambios }
}

const base = (f: typeof fetch) => ({
  meta: { version: 'v26.0', token: 'TOKEN' },
  supabase: { url: SUPA, secretKey: 'sb_secret_xyz' },
  organizacionId: 'org-1',
  hoy: new Date('2026-10-13T15:00:00Z'),
  f,
  esperar: async () => {},
})

describe('sincronizarPublicidad', () => {
  it('registra la cuenta con el NOMBRE del secreto de Vault, nunca el token', async () => {
    const { f, escrito } = mundo()
    await sincronizarPublicidad(base(f))
    expect(escrito['cuentas_meta']![0]).toMatchObject({
      organizacion_id: 'org-1',
      tipo: 'ad_account',
      meta_id: 'act_1',
      nombre: '999 MOTOS',
      token_ref: 'vault:meta_access_token',
    })
    expect(JSON.stringify(escrito)).not.toContain('TOKEN')
  })

  it('guarda las campañas activas o con datos en el período, no todo el histórico', async () => {
    const { f, escrito } = mundo()
    await sincronizarPublicidad(base(f))
    const ids = escrito['campanias']!.map((c) => c.meta_campaign_id).sort()
    expect(ids).toEqual(['c-activa', 'c-borrada', 'c-con-datos'])
  })

  it('una campaña que aparece en insights pero no en el listado se crea igual', async () => {
    const { f, escrito } = mundo()
    await sincronizarPublicidad(base(f))
    expect(escrito['campanias']!.find((c) => c.meta_campaign_id === 'c-borrada')).toMatchObject({
      nombre: 'Borrada',
      cuenta_id: 'cuentas_meta:act_1',
    })
  })

  it('guarda las métricas diarias atadas al id de la campaña en la base', async () => {
    const { f, escrito } = mundo()
    const r = await sincronizarPublicidad(base(f))
    expect(escrito['metricas_campania']).toHaveLength(2)
    expect(escrito['metricas_campania']![0]).toMatchObject({
      campania_id: 'campanias:c-con-datos',
      fecha: '2026-10-01',
      gasto: 100,
    })
    expect(r).toMatchObject({ estado: 'ok', filas: 5 })
  })

  it('pide los últimos 90 días', async () => {
    const { f } = mundo()
    await sincronizarPublicidad(base(f))
    const insights = f.mock.calls.map(([u]) => new URL(String(u))).find((u) => u.pathname.endsWith('/insights'))!
    expect(JSON.parse(insights.searchParams.get('time_range')!)).toEqual({
      since: '2026-07-16',
      until: '2026-10-13',
    })
  })

  it('abre la corrida en sincronizaciones y la cierra en ok', async () => {
    const { f, escrito, cambios } = mundo()
    await sincronizarPublicidad(base(f))
    expect(escrito['sincronizaciones']![0]).toMatchObject({ tipo: 'campanias', estado: 'corriendo' })
    const cierre = cambios.find((c) => c.tabla === 'sincronizaciones')!
    expect(cierre.cuerpo).toMatchObject({ estado: 'ok', filas_afectadas: 5, error: null })
    expect(cierre.cuerpo.terminada_en).toBeTruthy()
  })

  it('si una cuenta falla, sigue con las demás y la corrida queda en error con el detalle', async () => {
    const { f, escrito, cambios } = mundo({
      cuentas: [
        { id: 'act_mala', name: 'Sin permiso' },
        { id: 'act_1', name: '999 MOTOS' },
      ],
      falla: { 'act_mala/campaigns': { error: { message: 'Missing Permissions', code: 200 } } },
    })
    const r = await sincronizarPublicidad(base(f))
    expect(escrito['metricas_campania']).toHaveLength(2)
    expect(r.estado).toBe('error')
    const cierre = cambios.find((c) => c.tabla === 'sincronizaciones')!
    expect(cierre.cuerpo.estado).toBe('error')
    expect(cierre.cuerpo.error).toContain('act_mala: (#200) Missing Permissions')
  })

  it('si no puede listar las cuentas, cierra la corrida en error', async () => {
    const { f, cambios } = mundo({
      falla: { 'me/adaccounts': { error: { message: 'Invalid OAuth access token', code: 190 } } },
    })
    const r = await sincronizarPublicidad(base(f))
    expect(r.estado).toBe('error')
    expect(cambios.find((c) => c.tabla === 'sincronizaciones')!.cuerpo).toMatchObject({
      estado: 'error',
      error: '(#190) Invalid OAuth access token',
    })
  })
})
