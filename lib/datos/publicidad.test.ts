import { describe, it, expect, vi } from 'vitest'
import { atribuirCampanias, leerPublicidad, totalesPublicidad, type CampaniaReal } from './publicidad'
import { MARCAS } from './marcas'

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

describe('atribuirCampanias', () => {
  const camp = (nombre: string, gasto: number, resultados = 1): CampaniaReal => ({
    id: nombre,
    nombre,
    cuenta: 'c',
    objetivo: null,
    estado: null,
    gasto,
    impresiones: gasto * 10,
    clics: gasto / 10,
    resultados,
    dias: 1,
    ultimoDia: null,
  })
  const zontes = MARCAS[5]!.id
  const suzuki = MARCAS[2]!.id
  const benelli = MARCAS[3]!.id

  it('atribuye por token en el nombre (sin tildes ni mayúsculas) a las marcas elegidas', () => {
    const r = atribuirCampanias([camp('ZONTES - Tráfico', 100), camp('Promo Suzuki GSX', 50), camp('Institucional', 30)], [zontes, suzuki])
    expect(r.porMarca.map((m) => [m.marcaId, m.campanias, m.gasto])).toEqual([
      [suzuki, 1, 50],
      [zontes, 1, 100],
    ])
    expect(r.sinAtribuir).toMatchObject({ campanias: 1, gasto: 30 })
    expect(r.compartidas).toBe(0)
  })

  it('una campaña que nombra 2+ marcas es compartida: no se suma a ninguna fila ni dos veces', () => {
    const r = atribuirCampanias([camp('Zontes y Suzuki - Feria', 200), camp('Zontes - Reels', 100)], [zontes, suzuki])
    expect(r.compartidas).toBe(1)
    expect(r.compartidasTotales).toMatchObject({ campanias: 1, gasto: 200 })
    expect(r.porMarca.find((m) => m.marcaId === zontes)).toMatchObject({ campanias: 1, gasto: 100 })
    expect(r.porMarca.find((m) => m.marcaId === suzuki)).toMatchObject({ campanias: 0, gasto: 0 })
    const total = r.porMarca.reduce((t, m) => t + m.gasto, 0) + r.compartidasTotales.gasto + r.sinAtribuir.gasto
    expect(total).toBe(300)
  })

  it('una campaña que nombra una marca NO elegida cuenta como sin atribuir (a las elegidas)', () => {
    const r = atribuirCampanias([camp('Benelli TRK', 80)], [zontes])
    expect(r.sinAtribuir).toMatchObject({ campanias: 1, gasto: 80 })
    expect(r.porMarca[0]).toMatchObject({ marcaId: zontes, campanias: 0 })
    void benelli
  })

  it('nombra dos marcas pero solo una está elegida: es de esa marca, no compartida', () => {
    const r = atribuirCampanias([camp('Zontes y Suzuki', 60)], [zontes])
    expect(r.compartidas).toBe(0)
    expect(r.porMarca[0]).toMatchObject({ marcaId: zontes, gasto: 60 })
  })

  it('sin campañas: todo en cero', () => {
    const r = atribuirCampanias([], [zontes])
    expect(r.porMarca[0]).toMatchObject({ campanias: 0, gasto: 0, impresiones: 0, clics: 0, resultados: 0 })
    expect(r.sinAtribuir.campanias).toBe(0)
  })
})
