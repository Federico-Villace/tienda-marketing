import { describe, it, expect, vi } from 'vitest'
import { leerPublicidad, totalesPublicidad } from './publicidad'

const s = { url: 'https://abc.supabase.co', secretKey: 'sb_secret_xyz' }
const json = (c: unknown) => new Response(JSON.stringify(c), { status: 200 })

function base(filas: unknown[], sync: unknown[] = []) {
  return vi.fn<typeof fetch>(async (u) => {
    const url = new URL(String(u))
    if (url.pathname.endsWith('/rpc/resumen_publicidad')) return json(filas)
    if (url.pathname.endsWith('/sincronizaciones')) return json(sync)
    throw new Error(`URL inesperada: ${url}`)
  })
}

describe('leerPublicidad', () => {
  it('pide el resumen a Postgres y convierte numeric a number', async () => {
    const f = base([
      {
        campania_id: 'u1',
        campania: 'Tráfico',
        cuenta: '999 MOTOS',
        objetivo: 'OUTCOME_TRAFFIC',
        estado: 'ACTIVE',
        gasto: '1500.50',
        impresiones: 1000,
        clics: 20,
        resultados: 4,
        dias: 10,
        ultimo_dia: '2026-10-12',
      },
    ])
    const r = await leerPublicidad(s, 'org-1', '2026-07-15', f)
    expect(r.campanias[0]).toMatchObject({ nombre: 'Tráfico', cuenta: '999 MOTOS', gasto: 1500.5, resultados: 4 })

    const [u, init] = f.mock.calls.find(([x]) => String(x).includes('/rpc/'))!
    expect(JSON.parse(String(init?.body))).toEqual({ p_organizacion: 'org-1', p_desde: '2026-07-15' })
    expect(String(u)).toContain('resumen_publicidad')
  })

  it('con hasta, la RPC recibe p_hasta; sin hasta, no se manda (queda el default null)', async () => {
    const f = base([])
    await leerPublicidad(s, 'org-1', '2026-07-15', f, '2026-08-01')
    const [, init] = f.mock.calls.find(([x]) => String(x).includes('/rpc/'))!
    expect(JSON.parse(String(init?.body))).toEqual({
      p_organizacion: 'org-1',
      p_desde: '2026-07-15',
      p_hasta: '2026-08-01',
    })
  })

  it('trae la última corrida de campañas para mostrar cuándo se actualizó', async () => {
    const f = base([], [{ estado: 'ok', terminada_en: '2026-10-13T09:01:00Z', error: null }])
    const r = await leerPublicidad(s, 'org-1', '2026-07-15', f)
    expect(r.ultimaSync).toEqual({ estado: 'ok', terminadaEn: '2026-10-13T09:01:00Z', error: null })

    const url = new URL(String(f.mock.calls.find(([x]) => String(x).includes('sincronizaciones'))![0]))
    expect(url.searchParams.get('tipo')).toBe('eq.campanias')
    expect(url.searchParams.get('order')).toBe('iniciada_en.desc')
  })

  it('sin corridas, ultimaSync es null', async () => {
    expect((await leerPublicidad(s, 'org-1', '2026-07-15', base([]))).ultimaSync).toBeNull()
  })
})

describe('totalesPublicidad', () => {
  it('suma y calcula el costo por resultado sin dividir por cero', () => {
    const fila = { id: 'x', nombre: 'n', cuenta: 'c', objetivo: null, estado: null, dias: 1, ultimoDia: null }
    expect(
      totalesPublicidad([
        { ...fila, gasto: 100, impresiones: 1000, clics: 10, resultados: 4 },
        { ...fila, gasto: 50, impresiones: 500, clics: 5, resultados: 1 },
      ]),
    ).toEqual({ campanias: 2, gasto: 150, impresiones: 1500, clics: 15, resultados: 5, costoPorResultado: 30 })
    expect(totalesPublicidad([]).costoPorResultado).toBeNull()
  })
})
