import { describe, it, expect, vi, afterEach } from 'vitest'
import { manejarAntecedentes } from './endpoint'
import { HEADER_USUARIO } from '../../auth/acceso'
import { MARCAS } from '../../datos/marcas'
import { ORGANIZACION_PILOTO_ID } from '../../organizacion'
import { filaPromocion, ID_PROMO } from '../fixture'

const KEY = 'sk-test-SECRETISIMA-1234'
const entorno = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_xyz', OPENAI_API_KEY: KEY }
const AHORA = new Date('2026-10-25T15:00:00Z')
const MARCA = MARCAS[3]!
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })

const pedido = (usuario: string | null = 'u-1') =>
  new Request(`https://app.ejemplo.com/api/promociones/${ID_PROMO}/antecedentes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(usuario ? { [HEADER_USUARIO]: usuario } : {}) },
    body: '{}',
  })

const resumenDeLaBase = (o: Record<string, unknown> = {}) => ({
  modeloFiltrable: true,
  publicaciones: 12,
  organico: [{ mencionaModelo: true, plataforma: 'instagram', tipo: 'REELS', publicaciones: 3, vistas: 1500, interaccionesPromedio: 40, comentariosPromedio: 2, tasaInteraccion: 0.08 }],
  porPromo: [{ promo: 'cuotas', publicaciones: 4, vistas: 2000, interaccionesPromedio: 30, tasaInteraccion: 0.06 }],
  mejores: [{ fecha: '2026-10-03', plataforma: 'instagram', tipo: 'REELS', mencionaModelo: true, texto: 'TRK 502 en cuotas', vistas: 900, interacciones: 80 }],
  campanias: { totales: { campanias: 1, gasto: 1500.5, impresiones: 10000, clics: 100, resultados: 10 }, top: [] },
  ...o,
})
const sinDatos = () => resumenDeLaBase({ publicaciones: 0, organico: [], porPromo: [], mejores: [] })

const respuestaOpenAI = () => ({
  status: 'completed',
  output: [{ type: 'message', content: [{ type: 'output_text', text: 'Qué funcionó: los reels.' }] }],
  usage: { input_tokens: 3000, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens: 2000 },
})

function mundo(o: {
  rol?: string | null
  promo?: Record<string, unknown> | null
  resumen?: unknown
  existente?: unknown
  carrera?: unknown
  openai?: () => Response | Promise<Response>
  enlace?: (args: any) => Response
  hijas?: string[]
  comparado?: unknown
} = {}) {
  const insertados: Record<string, unknown>[] = []
  const rpcs: { nombre: string; args: any }[] = []
  let selectsAnalisis = 0
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    if (url.hostname === 'api.openai.com') return (o.openai ?? (() => json(respuestaOpenAI())))()
    if (url.hostname !== 'abc.supabase.co') throw new Error(`host inesperado ${url.hostname}`)
    if (url.pathname === '/rest/v1/miembros') return json(o.rol === null ? [] : [{ rol: o.rol ?? 'director' }])
    if (url.pathname === '/rest/v1/promociones') {
      if (url.searchParams.has('tanda_id')) return json((o.hijas ?? []).map((marca_id) => ({ marca_id })))
      return json(o.promo === null ? [] : [filaPromocion({ id: ID_PROMO, marca_id: MARCA.id, ...o.promo })])
    }
    if (url.pathname === '/rest/v1/rpc/resumen_promocion_comparado') {
      const args = JSON.parse(String(init?.body))
      rpcs.push({ nombre: 'resumen_promocion_comparado', args })
      return json(o.comparado ?? args.p_grupos.flatMap((g: any) => args.p_modelos.map((modelo: string) => ({ clave: g.clave, modelo, resumen: resumenDeLaBase({ publicaciones: 4 }) }))))
    }
    if (url.pathname === '/rest/v1/rpc/resumen_promocion') {
      rpcs.push({ nombre: 'resumen_promocion', args: JSON.parse(String(init?.body)) })
      return json(o.resumen ?? resumenDeLaBase())
    }
    if (url.pathname === '/rest/v1/rpc/editar_promocion') {
      const args = JSON.parse(String(init?.body))
      rpcs.push({ nombre: 'editar_promocion', args })
      return (o.enlace ?? ((a) => json(filaPromocion({ id: ID_PROMO, revision: a.p_revision + 1, analisis_id: a.p_campos.analisis_id }))))(args)
    }
    if (url.pathname === '/rest/v1/ediciones_analisis') return json([])
    if (url.pathname === '/rest/v1/analisis') {
      if (init?.method === 'POST') {
        if (o.carrera) return json({ message: 'duplicate key' }, 409)
        const fila = JSON.parse(String(init.body)) as Record<string, unknown>
        insertados.push(fila)
        return json([{ ...fila, id: 'an-nuevo', creado_en: '2026-10-25T15:00:01+00:00' }], 201)
      }
      selectsAnalisis += 1
      if (o.carrera) return json(selectsAnalisis === 1 ? [] : [o.carrera])
      return json(o.existente ? [o.existente] : [])
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, insertados, rpcs }
}

const existente = () => ({
  id: 'an-previo', contenido: 'Análisis guardado', modelo: 'gpt-6-luna', costo_usd: '0.0013', tokens_entrada: 3000, tokens_salida: 2000,
  creado_en: '2026-10-25T10:00:00+00:00', filtros: {},
})
const pedidoConCuerpo = (cuerpo: unknown) =>
  new Request(`https://app.ejemplo.com/api/promociones/${ID_PROMO}/antecedentes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [HEADER_USUARIO]: 'u-1' },
    body: JSON.stringify(cuerpo),
  })
const aOpenAI = (f: ReturnType<typeof mundo>['f']) => f.mock.calls.filter(([u]) => new URL(String(u)).hostname === 'api.openai.com')

afterEach(() => vi.restoreAllMocks())

describe('acceso: rechazos sin gastar nada (regla #3)', () => {
  it('sin sesión 401, lector 403: cero llamadas a OpenAI', async () => {
    const m = mundo()
    expect((await manejarAntecedentes(pedido(null), ID_PROMO, entorno, m.f, AHORA)).status).toBe(401)
    const m2 = mundo({ rol: 'lector' })
    expect((await manejarAntecedentes(pedido(), ID_PROMO, entorno, m2.f, AHORA)).status).toBe(403)
    expect(aOpenAI(m.f)).toHaveLength(0)
    expect(aOpenAI(m2.f)).toHaveLength(0)
  })
  it('sin OPENAI_API_KEY es 503 y no se toca nada', async () => {
    const m = mundo()
    const r = await manejarAntecedentes(pedido(), ID_PROMO, { ...entorno, OPENAI_API_KEY: '' }, m.f, AHORA)
    expect(r.status).toBe(503)
    expect(aOpenAI(m.f)).toHaveLength(0)
  })
  it('una promoción inexistente o con id inválido es 404; una aprobada, 409', async () => {
    const m = mundo({ promo: null })
    expect((await manejarAntecedentes(pedido(), ID_PROMO, entorno, m.f, AHORA)).status).toBe(404)
    expect((await manejarAntecedentes(pedido(), 'abc', entorno, mundo().f, AHORA)).status).toBe(404)
    const m2 = mundo({ promo: { estado: 'aprobada' } })
    expect((await manejarAntecedentes(pedido(), ID_PROMO, entorno, m2.f, AHORA)).status).toBe(409)
    expect(aOpenAI(m.f)).toHaveLength(0)
    expect(aOpenAI(m2.f)).toHaveLength(0)
  })
})

describe('sin datos (422)', () => {
  it('sin publicaciones ni campañas de la marca: mensaje claro y cero llamadas a OpenAI', async () => {
    const m = mundo({ resumen: resumenDeLaBase({ publicaciones: 0, organico: [], campanias: { totales: { campanias: 0, gasto: 0, impresiones: 0, clics: 0, resultados: 0 }, top: [] } }) })
    const r = await manejarAntecedentes(pedido(), ID_PROMO, entorno, m.f, AHORA)
    expect(r.status).toBe(422)
    expect(((await r.json()) as any).error).toBe(`Todavía no hay resultados de ${MARCA.nombre} para comparar. Podés seguir sin este paso.`)
    expect(aOpenAI(m.f)).toHaveLength(0)
  })
  it('con campañas pero sin publicaciones sí analiza', async () => {
    const m = mundo({ resumen: sinDatos() })
    expect((await manejarAntecedentes(pedido(), ID_PROMO, entorno, m.f, AHORA)).status).toBe(200)
  })
})

describe('el análisis', () => {
  it('lee los agregados de ESA marca en la ventana de 90 días (hora AR)', async () => {
    const m = mundo()
    await manejarAntecedentes(pedido(), ID_PROMO, entorno, m.f, AHORA)
    expect(m.rpcs[0]).toEqual({
      nombre: 'resumen_promocion',
      args: { p_org: ORGANIZACION_PILOTO_ID, p_cuentas: [MARCA.id, MARCA.igId], p_marca: 'benelli', p_modelo: 'TRK 502', p_desde: '2026-07-28', p_hasta: '2026-10-25' },
    })
  })

  it('al LLM solo viajan agregados: sin ids, permalinks ni la clave', async () => {
    const m = mundo({ resumen: resumenDeLaBase({ mejores: [{ fecha: 'f', plataforma: 'p', tipo: 't', mencionaModelo: true, texto: 'x', vistas: 1, interacciones: 1, id: 'ID-INTERNO', permalink: 'https://instagram.com/p/SECRETO' }] }) })
    await manejarAntecedentes(pedido(), ID_PROMO, entorno, m.f, AHORA)
    const [, init] = aOpenAI(m.f)[0]!
    const enviado = String(init!.body)
    expect(enviado).not.toMatch(/ID-INTERNO|SECRETO|permalink/)
    expect(enviado).toContain('"store":false')
    expect((init!.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`)
  })

  it('guarda el análisis como tipo "promocion" con los filtros, el costo y quién lo pidió', async () => {
    const m = mundo()
    await manejarAntecedentes(pedido(), ID_PROMO, entorno, m.f, AHORA)
    expect(m.insertados).toHaveLength(1)
    expect(m.insertados[0]).toMatchObject({
      organizacion_id: ORGANIZACION_PILOTO_ID,
      tipo: 'promocion',
      rango_desde: '2026-07-28',
      rango_hasta: '2026-10-25',
      version_prompt: 'promocion-antecedentes-v2',
      contenido: 'Qué funcionó: los reels.',
      creado_por: 'u-1',
      filtros: { promocionId: ID_PROMO, marcaId: MARCA.id, modelo: 'TRK 502', desde: '2026-07-28', hasta: '2026-10-25' },
    })
    expect(Number((m.insertados[0] as any).costo_usd)).toBeGreaterThan(0)
  })

  it('vincula el análisis a la promoción con editar_promocion y responde 200 con ambos', async () => {
    const m = mundo()
    const r = await manejarAntecedentes(pedido(), ID_PROMO, entorno, m.f, AHORA)
    expect(r.status).toBe(200)
    expect(m.rpcs.at(-1)).toEqual({
      nombre: 'editar_promocion',
      args: { p_id: ID_PROMO, p_revision: 1, p_campos: { analisis_id: 'an-nuevo' }, p_usuario: 'u-1' },
    })
    const b = (await r.json()) as any
    expect(b.desdeCache).toBe(false)
    expect(b.analisis.contenido).toBe('Qué funcionó: los reels.')
    expect(b.promocion.analisisId).toBe('an-nuevo')
    expect(b.promocion.pasoActual).toBe(3)
    expect(JSON.stringify(b)).not.toContain(KEY)
  })

  it('el caché por hash: mismos datos el mismo día no vuelven a cobrar, pero se vincula igual', async () => {
    const m = mundo({ existente: existente() })
    const r = await manejarAntecedentes(pedido(), ID_PROMO, entorno, m.f, AHORA)
    expect(r.status).toBe(200)
    const b = (await r.json()) as any
    expect(b.desdeCache).toBe(true)
    expect(aOpenAI(m.f)).toHaveLength(0)
    expect(m.insertados).toHaveLength(0)
    expect(m.rpcs.at(-1)!.args.p_campos).toEqual({ analisis_id: 'an-previo' })
  })

  it('doble click: si otro pedido ganó la carrera se devuelve el ganador', async () => {
    const m = mundo({ carrera: existente() })
    const r = await manejarAntecedentes(pedido(), ID_PROMO, entorno, m.f, AHORA)
    expect(r.status).toBe(200)
    expect(((await r.json()) as any).desdeCache).toBe(true)
  })

  it('si la promoción cambió mientras tanto, reintenta el vínculo con la revisión nueva', async () => {
    let intentos = 0
    const m = mundo({
      enlace: (a) => {
        intentos += 1
        return intentos === 1 ? json({ message: 'Esta promoción cambió' }, 409) : json(filaPromocion({ id: ID_PROMO, revision: a.p_revision + 1, analisis_id: 'an-nuevo' }))
      },
    })
    const r = await manejarAntecedentes(pedido(), ID_PROMO, entorno, m.f, AHORA)
    expect(r.status).toBe(200)
    expect(intentos).toBe(2)
  })
})

describe('errores de OpenAI', () => {
  it('timeout 504 y el resto 502, sin filtrar la clave ni guardar nada', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = mundo({ openai: () => { throw Object.assign(new Error('x'), { name: 'AbortError' }) } })
    const r = await manejarAntecedentes(pedido(), ID_PROMO, entorno, m.f, AHORA)
    expect([502, 504]).toContain(r.status)
    expect(await r.text()).not.toContain(KEY)
    expect(m.insertados).toHaveLength(0)
    const m2 = mundo({ openai: () => json({ error: { message: 'Incorrect API key sk-test-SECRETISIMA' } }, 401) })
    const r2 = await manejarAntecedentes(pedido(), ID_PROMO, entorno, m2.f, AHORA)
    expect(r2.status).toBe(502)
    expect(await r2.text()).not.toContain('SECRETISIMA')
  })
  it('un fallo de la base es 500 sin filtrar detalles', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = mundo({ resumen: undefined })
    const f = vi.fn<typeof fetch>(async (u, init) => {
      if (new URL(String(u)).pathname.endsWith('resumen_promocion')) return json({ message: 'boom interno' }, 500)
      return m.f(u, init)
    })
    const r = await manejarAntecedentes(pedido(), ID_PROMO, entorno, f, AHORA)
    expect(r.status).toBe(500)
    expect(await r.text()).not.toContain('boom')
  })
})

describe('comparación entre marcas (v2)', () => {
  const [suzuki, zontes] = [MARCAS[2]!, MARCAS[5]!]
  const enviado = (m: ReturnType<typeof mundo>) => (JSON.parse(String(aOpenAI(m.f)[0]![1]!.body)) as { input: string }).input

  it('una promoción suelta no compara nada: una sola RPC y sin "comparacion"', async () => {
    const m = mundo()
    await manejarAntecedentes(pedido(), ID_PROMO, entorno, m.f, AHORA)
    expect(m.rpcs.map((r) => r.nombre)).not.toContain('resumen_promocion_comparado')
    expect(enviado(m)).not.toContain('comparacion')
  })

  it('una hija de tanda compara con las marcas de su tanda, con UNA RPC extra y solo agregados', async () => {
    const m = mundo({ promo: { tanda_id: 'T1' }, hijas: [MARCA.id, suzuki.id, zontes.id] })
    const r = await manejarAntecedentes(pedido(), ID_PROMO, entorno, m.f, AHORA)
    expect(r.status).toBe(200)
    const comp = m.rpcs.filter((x) => x.nombre === 'resumen_promocion_comparado')
    expect(comp).toHaveLength(1)
    expect(comp[0]!.args).toMatchObject({ p_modelos: ['TRK 502'], p_desde: '2026-07-28', p_hasta: '2026-10-25' })
    expect(comp[0]!.args.p_grupos.map((g: any) => g.clave)).toEqual([suzuki.id, MARCA.id, zontes.id])
    expect(enviado(m)).toContain('comparacion')
    expect(enviado(m)).toContain('Zontes Quilmes')
    expect(enviado(m)).not.toContain(zontes.igId)
  })

  it('con el pedido "comparar" compara con esas marcas (más la propia); lo inválido se ignora', async () => {
    const m = mundo()
    await manejarAntecedentes(pedidoConCuerpo({ comparar: [zontes.id, 'nope', 12] }), ID_PROMO, entorno, m.f, AHORA)
    const comp = m.rpcs.find((x) => x.nombre === 'resumen_promocion_comparado')!
    expect(comp.args.p_grupos.map((g: any) => g.clave)).toEqual([MARCA.id, zontes.id])
  })

  it('si no hay con quién comparar (solo la propia marca) no hay RPC ni "comparacion"', async () => {
    const m = mundo({ promo: { tanda_id: 'T1' }, hijas: [MARCA.id] })
    await manejarAntecedentes(pedido(), ID_PROMO, entorno, m.f, AHORA)
    expect(m.rpcs.map((r) => r.nombre)).not.toContain('resumen_promocion_comparado')
    expect(enviado(m)).not.toContain('comparacion')
  })

  it('la comparación cambia el caché: mismos datos propios con otras marcas es otro análisis', async () => {
    const a = mundo({ promo: { tanda_id: 'T1' }, hijas: [MARCA.id, suzuki.id] })
    const b = mundo({ promo: { tanda_id: 'T1' }, hijas: [MARCA.id, zontes.id] })
    await manejarAntecedentes(pedido(), ID_PROMO, entorno, a.f, AHORA)
    await manejarAntecedentes(pedido(), ID_PROMO, entorno, b.f, AHORA)
    expect(a.insertados[0]!.hash_entrada).not.toBe(b.insertados[0]!.hash_entrada)
  })

  it('un body roto no rompe nada', async () => {
    const m = mundo()
    const req = new Request('https://x/api', { method: 'POST', headers: { [HEADER_USUARIO]: 'u-1' }, body: 'esto no es json' })
    expect((await manejarAntecedentes(req, ID_PROMO, entorno, m.f, AHORA)).status).toBe(200)
  })
})
