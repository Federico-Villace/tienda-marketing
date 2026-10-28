import { describe, it, expect, vi, afterEach } from 'vitest'
import { manejarPlan } from './endpoint'
import { HEADER_USUARIO } from '../auth/acceso'
import { MARCAS } from '../datos/marcas'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'

const KEY = 'sk-test-SECRETISIMA-1234'
const entorno = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_xyz',
  OPENAI_API_KEY: KEY,
}
const ANALISIS_ID = '11111111-1111-4111-8111-111111111111'
const TEXTO_ANALISIS = 'Resumen: los reels de Zontes rindieron 3000 vistas.'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })

const brief = (o: Record<string, unknown> = {}) => ({
  analisisId: ANALISIS_ID,
  objetivo: 'Vender más Zontes en noviembre',
  marcas: [MARCAS[5]!.nombre],
  presupuestoTopeArs: 500000,
  desde: '2026-11-01',
  hasta: '2026-11-28',
  ...o,
})

const pedido = (opciones: { usuario?: string | null; cuerpo?: unknown } = {}) => {
  const usuario = opciones.usuario === undefined ? 'u-1' : opciones.usuario
  return new Request('https://app.ejemplo.com/api/planes', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(usuario ? { [HEADER_USUARIO]: usuario } : {}) },
    body: JSON.stringify(opciones.cuerpo ?? brief()),
  })
}

const planModelo = () => ({
  objetivo: 'Subir consultas por mensaje',
  mensajeCentral: 'Probá la Zontes este mes',
  publico: { descripcion: 'Hombres de 25 a 40 de Quilmes', segmentos: [] },
  marcas: [MARCAS[5]!.nombre],
  presupuesto: { montoArs: 300000, nivel: 'campania', nota: null },
  ventana: { desde: '2026-11-01', hasta: '2026-11-28' },
  canales: [{ plataforma: 'instagram', formatos: ['reel'], porcentaje: 100, porque: 'Mejores vistas' }],
  calendario: [{ semana: 1, eje: 'Lanzamiento', piezas: [{ plataforma: 'instagram', formato: 'reel', cantidad: 2, idea: 'Test ride', marca: null }] }],
  kpis: [],
  fundamentos: ['"los reels de Zontes rindieron 3000 vistas"'],
  supuestos: [],
})

const respuestaOpenAI = (texto: string = JSON.stringify(planModelo())) => ({
  status: 'completed',
  output: [{ type: 'message', content: [{ type: 'output_text', text: texto }] }],
  usage: { input_tokens: 3000, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens: 2000 },
})

type Mundo = {
  rol?: string | null
  analisis?: unknown | null
  existente?: unknown | null
  carrera?: unknown
  /** Recibe el body parseado de cada llamada a OpenAI (en orden). */
  openai?: (cuerpo: any, n: number) => Response | Promise<Response>
}

function mundo(o: Mundo = {}) {
  const insertados: Record<string, unknown>[] = []
  const cuerposOpenAI: any[] = []
  let selectsPlanes = 0
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    if (url.hostname === 'api.openai.com') {
      const cuerpo = JSON.parse(String(init?.body))
      cuerposOpenAI.push(cuerpo)
      return (o.openai ?? (() => json(respuestaOpenAI())))(cuerpo, cuerposOpenAI.length)
    }
    if (url.pathname === '/rest/v1/miembros') return json(o.rol === null ? [] : [{ rol: o.rol ?? 'director' }])
    if (url.pathname === '/rest/v1/analisis') {
      return json(o.analisis === null ? [] : [o.analisis ?? { id: ANALISIS_ID, contenido: TEXTO_ANALISIS }])
    }
    if (url.pathname === '/rest/v1/planes') {
      if (init?.method === 'POST') {
        if (o.carrera) return json({ message: 'duplicate key value violates unique constraint' }, 409)
        const fila = JSON.parse(String(init.body)) as Record<string, unknown>
        insertados.push(fila)
        return json([{ ...fila, id: 'nuevo', raiz_id: 'nuevo', padre_id: null, creado_en: '2026-10-20T15:00:01+00:00', aprobado_en: null }], 201)
      }
      selectsPlanes += 1
      if (o.carrera) return json(selectsPlanes === 1 ? [] : [o.carrera])
      return json(o.existente ? [o.existente] : [])
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, insertados, cuerposOpenAI }
}

const previo = (o: Record<string, unknown> = {}) => ({
  id: 'previo', raiz_id: 'previo', padre_id: null, version: 1, origen: 'agente', estado: 'borrador',
  analisis_id: ANALISIS_ID, brief: brief(), plan: planModelo(), modelo: 'gpt-6-luna', costo_usd: '0.0021',
  creado_en: '2026-10-19T15:00:00+00:00', aprobado_en: null, ...o,
})

const llamadasA = (f: ReturnType<typeof mundo>['f'], host: string) =>
  f.mock.calls.filter(([u]) => new URL(String(u)).hostname === host)

afterEach(() => vi.restoreAllMocks())

describe('manejarPlan · acceso (S29, S4-S8)', () => {
  it('sin sesión 401 y sin tocar nada', async () => {
    const m = mundo()
    expect((await manejarPlan(pedido({ usuario: null }), entorno, m.f)).status).toBe(401)
    expect(m.f).not.toHaveBeenCalled()
  })

  it('lector 403 y sin gastar', async () => {
    const m = mundo({ rol: 'lector' })
    expect((await manejarPlan(pedido(), entorno, m.f)).status).toBe(403)
    expect(llamadasA(m.f, 'api.openai.com')).toHaveLength(0)
  })

  it('sin OPENAI_API_KEY 503; modelo sin precio 500 antes de llamar', async () => {
    const { OPENAI_API_KEY: _, ...sin } = entorno
    expect((await manejarPlan(pedido(), sin, mundo().f)).status).toBe(503)
    const m = mundo()
    const r = await manejarPlan(pedido(), { ...entorno, MODELO_ESTRATEGA: 'inventado' }, m.f)
    expect(r.status).toBe(500)
    expect(llamadasA(m.f, 'api.openai.com')).toHaveLength(0)
  })

  it('usa MODELO_ESTRATEGA y no MODELO_ANALISTA', async () => {
    const m = mundo()
    await manejarPlan(pedido(), { ...entorno, MODELO_ANALISTA: 'gpt-5.6-luna', MODELO_ESTRATEGA: 'gpt-6-luna' }, m.f)
    expect(m.cuerposOpenAI[0].model).toBe('gpt-6-luna')
  })
})

describe('manejarPlan · brief (S9-S14, S29)', () => {
  it('brief inválido 400 con los errores, sin gastar', async () => {
    const m = mundo()
    const r = await manejarPlan(pedido({ cuerpo: brief({ objetivo: '' }) }), entorno, m.f)
    expect(r.status).toBe(400)
    expect((await r.json()).errores.join()).toMatch(/objetivo/i)
    expect(llamadasA(m.f, 'api.openai.com')).toHaveLength(0)
  })

  it('body que no es JSON 400', async () => {
    const req = new Request('https://app.ejemplo.com/api/planes', { method: 'POST', headers: { [HEADER_USUARIO]: 'u-1' }, body: 'no json' })
    expect((await manejarPlan(req, entorno, mundo().f)).status).toBe(400)
  })

  it('S14: análisis inexistente o de otra organización 404, sin llamar a OpenAI', async () => {
    const m = mundo({ analisis: null })
    expect((await manejarPlan(pedido(), entorno, m.f)).status).toBe(404)
    expect(llamadasA(m.f, 'api.openai.com')).toHaveLength(0)
    const sel = m.f.mock.calls.map(([u]) => new URL(String(u))).find((u) => u.pathname === '/rest/v1/analisis')!
    expect(sel.searchParams.get('id')).toBe(`eq.${ANALISIS_ID}`)
    expect(sel.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
  })
})

describe('manejarPlan · generación (S22-S26)', () => {
  it('S22: pide json_schema strict y guarda el plan válido como versión 1 del agente', async () => {
    const m = mundo()
    const r = await manejarPlan(pedido({ usuario: 'u-9' }), entorno, m.f)
    expect(r.status).toBe(200)
    expect(m.cuerposOpenAI[0].text.format).toMatchObject({ type: 'json_schema', strict: true, name: 'plan_campania' })
    const cuerpo = await r.json()
    expect(cuerpo.desdeCache).toBe(false)
    expect(cuerpo.plan).toMatchObject({ version: 1, origen: 'agente', estado: 'borrador', costoUsd: 0.0013, desdeCache: false })
    expect(m.insertados).toHaveLength(1)
    expect(m.insertados[0]).toMatchObject({
      organizacion_id: ORGANIZACION_PILOTO_ID,
      version: 1,
      origen: 'agente',
      estado: 'borrador',
      analisis_id: ANALISIS_ID,
      version_prompt: 'estratega-v2',
      modelo: 'gpt-6-luna',
      tokens_entrada: 3000,
      tokens_salida: 2000,
      costo_usd: 0.0013,
      creado_por: 'u-9',
    })
    expect(m.insertados[0]).not.toHaveProperty('raiz_id')
    expect(String(m.insertados[0]!.hash_entrada)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('S23: si OpenAI rechaza el json_schema (400) reintenta con json_object y valida igual', async () => {
    const m = mundo({ openai: (_c, n) => (n === 1 ? json({ error: { message: 'Invalid schema' } }, 400) : json(respuestaOpenAI())) })
    const r = await manejarPlan(pedido(), entorno, m.f)
    expect(r.status).toBe(200)
    expect(m.cuerposOpenAI).toHaveLength(2)
    expect(m.cuerposOpenAI[1].text.format).toEqual({ type: 'json_object' })
    expect(m.cuerposOpenAI[1].instructions).toContain('JSON Schema')
    expect(m.insertados).toHaveLength(1)
  })

  it('un 400 repetido en el respaldo es 502 y no hay un tercer intento', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = mundo({ openai: () => json({ error: { message: 'no' } }, 400) })
    expect((await manejarPlan(pedido(), entorno, m.f)).status).toBe(502)
    expect(m.cuerposOpenAI).toHaveLength(2)
    expect(m.insertados).toHaveLength(0)
  })

  it('otros errores HTTP (429) no caen al respaldo', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = mundo({ openai: () => json({}, 429) })
    expect((await manejarPlan(pedido(), entorno, m.f)).status).toBe(502)
    expect(m.cuerposOpenAI).toHaveLength(1)
  })

  it('S24: JSON roto o plan inválido responde 502, no guarda y no filtra la clave', async () => {
    const espia = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const texto of ['esto no es json', JSON.stringify({ ...planModelo(), canales: [] })]) {
      const m = mundo({ openai: () => json(respuestaOpenAI(texto)) })
      const r = await manejarPlan(pedido(), entorno, m.f)
      expect(r.status).toBe(502)
      const t = await r.text()
      expect(t).toMatch(/plan inválido/)
      expect(t).not.toContain(KEY)
      expect(m.insertados).toHaveLength(0)
    }
    expect(JSON.stringify(espia.mock.calls)).not.toContain(KEY)
  })

  it('un plan con marcas fuera del brief es inválido (502)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = mundo({ openai: () => json(respuestaOpenAI(JSON.stringify({ ...planModelo(), marcas: ['Suzuki Quilmes'] }))) })
    expect((await manejarPlan(pedido(), entorno, m.f)).status).toBe(502)
  })

  it('un análisis estructurado (analista-v4) le llega al Estratega en texto plano, nunca como JSON', async () => {
    const json4 = JSON.stringify({
      resumen: 'Los reels de Zontes rindieron más.',
      hace: [{ accion: 'Más reels', porque: 'Rinden el doble', hechos: ['h1'] }],
      evita: [],
      proba: [],
      ideas: [],
    })
    const m = mundo({ analisis: { id: ANALISIS_ID, contenido: json4, formato: 'estructurado' } })
    await manejarPlan(pedido(), entorno, m.f)
    const entrada = m.cuerposOpenAI[0].input as string
    expect(entrada).toContain('Resumen: Los reels de Zontes rindieron más.')
    expect(entrada).toContain('Hacé:\n- Más reels. Rinden el doble')
    expect(entrada).not.toContain('"hechos"')
  })

  it('S25: a OpenAI le llega el texto del análisis y el brief, sin filas, ids ni claves', async () => {
    const m = mundo()
    await manejarPlan(pedido(), entorno, m.f)
    const body = JSON.stringify(m.cuerposOpenAI[0])
    expect(m.cuerposOpenAI[0].input).toContain(TEXTO_ANALISIS)
    expect(m.cuerposOpenAI[0].input).toContain('Vender más Zontes en noviembre')
    for (const prohibido of [ANALISIS_ID, ORGANIZACION_PILOTO_ID, 'permalink', 'crudo', 'sb_secret_xyz', MARCAS[5]!.id, MARCAS[5]!.igId]) {
      expect(body).not.toContain(prohibido)
    }
    for (const [u] of m.f.mock.calls) {
      expect(new URL(String(u)).hostname).not.toMatch(/facebook\.com|facebook\.net|instagram\.com/)
    }
  })

  it('S26: error y timeout de OpenAI responden 502/504 sin fila y sin la clave', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = mundo({ openai: () => json({ error: { message: `Incorrect API key: ${KEY}` } }, 401) })
    const r = await manejarPlan(pedido(), entorno, m.f)
    expect(r.status).toBe(502)
    expect(await r.text()).not.toContain(KEY)
    expect(m.insertados).toHaveLength(0)

    vi.useFakeTimers()
    const t = mundo()
    const enrutado = t.f.getMockImplementation()!
    t.f.mockImplementation((u, init) =>
      new URL(String(u)).hostname === 'api.openai.com'
        ? new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('x', 'AbortError'))))
        : enrutado(u, init),
    )
    const p = manejarPlan(pedido(), entorno, t.f)
    await vi.advanceTimersByTimeAsync(91_000)
    const r2 = await p
    vi.useRealTimers()
    expect(r2.status).toBe(504)
    expect(t.insertados).toHaveLength(0)
  })

  it('la fila guardada no contiene OPENAI_API_KEY ni el secreto de Supabase (R7)', async () => {
    const m = mundo()
    await manejarPlan(pedido(), entorno, m.f)
    const fila = JSON.stringify(m.insertados[0])
    expect(fila).not.toContain(KEY)
    expect(fila).not.toContain('sb_secret_xyz')
  })

  it('si Supabase falla responde 500 genérico sin filtrar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const f = vi.fn<typeof fetch>(async () => json({ message: 'boom' }, 500))
    const r = await manejarPlan(pedido(), entorno, f)
    expect(r.status).toBe(500)
    expect(await r.text()).not.toContain(KEY)
  })
})

describe('manejarPlan · caché (S27, S28)', () => {
  it('S27: mismo input devuelve el plan existente sin llamar a OpenAI ni insertar', async () => {
    const m = mundo({ existente: previo() })
    const r = await manejarPlan(pedido(), entorno, m.f)
    expect(r.status).toBe(200)
    const cuerpo = await r.json()
    expect(cuerpo.desdeCache).toBe(true)
    expect(cuerpo.plan).toMatchObject({ id: 'previo', desdeCache: true })
    expect(llamadasA(m.f, 'api.openai.com')).toHaveLength(0)
    expect(m.insertados).toHaveLength(0)
  })

  it('el caché se busca por organización, hash y origen agente', async () => {
    const m = mundo()
    await manejarPlan(pedido(), entorno, m.f)
    const sel = m.f.mock.calls.map(([u]) => new URL(String(u))).find((u) => u.pathname === '/rest/v1/planes')!
    expect(sel.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
    expect(sel.searchParams.get('origen')).toBe('eq.agente')
    expect(sel.searchParams.get('hash_entrada')).toMatch(/^eq\.[0-9a-f]{64}$/)
  })

  it('S28: cambia el brief, el análisis o el modelo y el hash es distinto', async () => {
    const hash = async (cuerpo: unknown, env: Record<string, string | undefined> = entorno, analisis?: unknown) => {
      const m = mundo({ analisis })
      await manejarPlan(pedido({ cuerpo }), env, m.f)
      return m.insertados[0]!.hash_entrada
    }
    const base = await hash(brief())
    expect(await hash(brief())).toBe(base)
    expect(await hash(brief({ notas: 'otra cosa' }))).not.toBe(base)
    expect(await hash(brief(), entorno, { id: ANALISIS_ID, contenido: 'otro análisis' })).not.toBe(base)
    expect(await hash(brief(), { ...entorno, MODELO_ESTRATEGA: 'gpt-5.6-luna' })).not.toBe(base)
  })

  it('el orden de las claves del brief no cambia el hash', async () => {
    const a = mundo()
    const b = mundo()
    await manejarPlan(pedido({ cuerpo: brief() }), entorno, a.f)
    await manejarPlan(pedido({ cuerpo: Object.fromEntries(Object.entries(brief()).reverse()) }), entorno, b.f)
    expect(a.insertados[0]!.hash_entrada).toBe(b.insertados[0]!.hash_entrada)
  })

  it('doble click: si el insert choca (409) devuelve el ganador sin error', async () => {
    const m = mundo({ carrera: previo({ id: 'ganador', raiz_id: 'ganador' }) })
    const r = await manejarPlan(pedido(), entorno, m.f)
    expect(r.status).toBe(200)
    const cuerpo = await r.json()
    expect(cuerpo.plan.id).toBe('ganador')
    expect(cuerpo.desdeCache).toBe(true)
  })
})
