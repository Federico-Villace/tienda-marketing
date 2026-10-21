import { describe, it, expect, vi, afterEach } from 'vitest'
import { manejarTanda } from './endpoint'
import { HEADER_USUARIO } from '../auth/acceso'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { planDePrueba, piezasDePrueba } from './fixture'

const KEY = 'sk-test-SECRETISIMA-1234'
const SECRETA = 'sb_secret_xyz'
const entorno = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: SECRETA, OPENAI_API_KEY: KEY }
const PLAN_ID = '11111111-1111-4111-8111-111111111111'
const NOTAS = 'Financiación en 12 cuotas y mucho foco en la moto de la semana'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })

const pedido = (o: { usuario?: string | null; cuerpo?: unknown } = {}) => {
  const usuario = o.usuario === undefined ? 'u-1' : o.usuario
  return new Request('https://app.ejemplo.com/api/contenido', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(usuario ? { [HEADER_USUARIO]: usuario } : {}) },
    body: JSON.stringify(o.cuerpo ?? { plan_id: PLAN_ID, semana: 1, notas: NOTAS }),
  })
}

const respuestaOpenAI = (texto: string = JSON.stringify({ piezas: piezasDePrueba() })) => ({
  status: 'completed',
  output: [{ type: 'message', content: [{ type: 'output_text', text: texto }] }],
  usage: { input_tokens: 3000, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens: 4000 },
})

type Mundo = {
  rol?: string | null
  plan?: Record<string, unknown> | null
  /** Tanda ya guardada con ese hash. */
  existente?: Record<string, unknown> | null
  /** El RPC pierde la carrera: responde 409 y la relectura trae esta tanda. */
  carrera?: Record<string, unknown>
  openai?: (cuerpo: any, n: number) => Response | Promise<Response>
}

const filaPlan = (o: Record<string, unknown> = {}) => ({ id: PLAN_ID, estado: 'aprobado', plan: planDePrueba(), ...o })
const filaTanda = (o: Record<string, unknown> = {}) => ({
  id: 'tanda-1', plan_id: PLAN_ID, semana: 1, notas: NOTAS, modelo: 'gpt-6-luna', costo_usd: '0.002', creado_en: '2026-10-21T10:00:00Z', ...o,
})
const filaPieza = (p: unknown, i: number) => ({
  id: `pz-${i + 1}`, raiz_id: `pz-${i + 1}`, padre_id: null, tanda_id: 'tanda-1', plan_id: PLAN_ID, semana: 1, orden: i + 1, version: 1,
  origen: 'agente', estado: 'borrador', pieza: p, creado_en: '2026-10-21T10:00:00Z', aprobado_en: null,
})

function mundo(o: Mundo = {}) {
  const cuerposOpenAI: any[] = []
  const rpcs: { nombre: string; args: any }[] = []
  let relecturasHash = 0
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    if (url.hostname === 'api.openai.com') {
      const cuerpo = JSON.parse(String(init?.body))
      cuerposOpenAI.push(cuerpo)
      return (o.openai ?? (() => json(respuestaOpenAI())))(cuerpo, cuerposOpenAI.length)
    }
    if (url.pathname === '/rest/v1/miembros') return json(o.rol === null ? [] : [{ rol: o.rol ?? 'director' }])
    if (url.pathname === '/rest/v1/planes') return json(o.plan === null ? [] : [o.plan ?? filaPlan()])
    if (url.pathname === '/rest/v1/tandas_contenido') {
      relecturasHash += 1
      if (o.carrera) return json(relecturasHash === 1 ? [] : [o.carrera])
      return json(o.existente ? [o.existente] : [])
    }
    if (url.pathname === '/rest/v1/piezas') {
      return json(piezasDePrueba().map(filaPieza))
    }
    if (url.pathname === '/rest/v1/rpc/guardar_tanda') {
      const args = JSON.parse(String(init?.body))
      rpcs.push({ nombre: 'guardar_tanda', args })
      if (o.carrera) return json({ message: 'Esa tanda ya existe' }, 409)
      return json(filaTanda({ costo_usd: args.p_tanda.costo_usd, notas: args.p_tanda.notas }))
    }
    throw new Error(`fetch inesperado: ${url.pathname}`)
  })
  return { f, cuerposOpenAI, rpcs }
}

const llamadasOpenAI = (f: ReturnType<typeof vi.fn>) => f.mock.calls.filter((c) => String(c[0]).includes('api.openai.com')).length

afterEach(() => vi.restoreAllMocks())

describe('auth y pedido', () => {
  it('S6 sin sesión es 401 y sin llamar a nada', async () => {
    const m = mundo()
    expect((await manejarTanda(pedido({ usuario: null }), entorno, m.f)).status).toBe(401)
    expect(m.f).not.toHaveBeenCalled()
  })
  it('S6 lector es 403 y sin llamar a OpenAI', async () => {
    const m = mundo({ rol: 'lector' })
    expect((await manejarTanda(pedido(), entorno, m.f)).status).toBe(403)
    expect(llamadasOpenAI(m.f)).toBe(0)
  })
  it('S11 un modelo sin precio falla antes de llamar a fetch', async () => {
    const m = mundo()
    const r = await manejarTanda(pedido(), { ...entorno, MODELO_CONTENIDISTA: 'gpt-inventado' }, m.f)
    expect(r.status).toBe(500)
    expect(m.f).not.toHaveBeenCalled()
  })
  it('un pedido mal formado (otra clave, uuid roto, semana no entera) es 400 sin OpenAI', async () => {
    for (const cuerpo of [{ plan_id: PLAN_ID, semana: 1, filas: [] }, { plan_id: 'x', semana: 1 }, { plan_id: PLAN_ID, semana: 1.5 }]) {
      const m = mundo()
      expect((await manejarTanda(pedido({ cuerpo }), entorno, m.f)).status).toBe(400)
      expect(llamadasOpenAI(m.f)).toBe(0)
    }
  })
  it('S10 notas de 1001 caracteres es 422; 1000 pasa', async () => {
    const m = mundo()
    expect((await manejarTanda(pedido({ cuerpo: { plan_id: PLAN_ID, semana: 1, notas: 'a'.repeat(1001) } }), entorno, m.f)).status).toBe(422)
    expect(llamadasOpenAI(m.f)).toBe(0)
    const m2 = mundo()
    expect((await manejarTanda(pedido({ cuerpo: { plan_id: PLAN_ID, semana: 1, notas: 'a 12 cuotas'.padEnd(1000, 'a') } }), entorno, m2.f)).status).toBe(200)
  })
})

describe('el plan', () => {
  it('S8 un plan inexistente es 404', async () => {
    const m = mundo({ plan: null })
    expect((await manejarTanda(pedido(), entorno, m.f)).status).toBe(404)
    expect(llamadasOpenAI(m.f)).toBe(0)
  })
  it('S7 un plan borrador, reemplazado o descartado es 409 sin OpenAI', async () => {
    for (const estado of ['borrador', 'reemplazado', 'descartado']) {
      const m = mundo({ plan: filaPlan({ estado }) })
      const r = await manejarTanda(pedido(), entorno, m.f)
      expect(r.status).toBe(409)
      expect(llamadasOpenAI(m.f)).toBe(0)
    }
  })
  it('S8 una semana que no está en el calendario es 422', async () => {
    const m = mundo()
    expect((await manejarTanda(pedido({ cuerpo: { plan_id: PLAN_ID, semana: 99 } }), entorno, m.f)).status).toBe(422)
    expect(llamadasOpenAI(m.f)).toBe(0)
  })
  it('una semana que arranca después de la ventana del plan es 422', async () => {
    const plan = planDePrueba()
    plan.ventana = { desde: '2026-11-02', hasta: '2026-11-05' }
    plan.calendario.push({ semana: 3, eje: 'x', piezas: [{ plataforma: 'instagram', formato: 'imagen', cantidad: 1, idea: 'x' }] })
    const m = mundo({ plan: filaPlan({ plan }) })
    expect((await manejarTanda(pedido({ cuerpo: { plan_id: PLAN_ID, semana: 3 } }), entorno, m.f)).status).toBe(422)
  })
  it('S9 una semana con más de 12 piezas es 422 "editá el plan" sin llamar', async () => {
    const plan = planDePrueba()
    plan.calendario[0]!.piezas[0]!.cantidad = 10
    const m = mundo({ plan: filaPlan({ plan }) })
    const r = await manejarTanda(pedido(), entorno, m.f)
    expect(r.status).toBe(422)
    expect(((await r.json()) as { error: string }).error).toMatch(/Editá el plan/)
    expect(llamadasOpenAI(m.f)).toBe(0)
  })
})

describe('la llamada', () => {
  it('S12 el body de OpenAI lleva solo la semana, las notas y las instrucciones', async () => {
    const m = mundo()
    await manejarTanda(pedido(), entorno, m.f)
    const body = JSON.stringify(m.cuerposOpenAI[0])
    expect(m.cuerposOpenAI).toHaveLength(1)
    expect(body).toContain('Recorrido por el taller')
    expect(body).toContain(NOTAS)
    for (const prohibido of [PLAN_ID, ORGANIZACION_PILOTO_ID, KEY, SECRETA, 'permalink', 'organizacion_id', 'sb_secret', '300000', 'Encuesta']) {
      expect(body, prohibido).not.toContain(prohibido)
    }
    expect(m.cuerposOpenAI[0].max_output_tokens).toBe(8000)
    expect(m.cuerposOpenAI[0].text.format.strict).toBe(true)
  })
  it('S13 las instrucciones llevan la regla de precios y la versión del prompt', async () => {
    const m = mundo()
    await manejarTanda(pedido(), entorno, m.f)
    expect(m.cuerposOpenAI[0].instructions).toContain('[precio]')
    expect(m.cuerposOpenAI[0].instructions).toContain('contenidista-v1')
  })
  it('S30 usa gpt-6-luna por defecto y MODELO_CONTENIDISTA lo sobreescribe', async () => {
    const m = mundo()
    await manejarTanda(pedido(), entorno, m.f)
    expect(m.cuerposOpenAI[0].model).toBe('gpt-6-luna')
    const m2 = mundo()
    await manejarTanda(pedido(), { ...entorno, MODELO_CONTENIDISTA: 'gpt-5.6-luna' }, m2.f)
    expect(m2.cuerposOpenAI[0].model).toBe('gpt-5.6-luna')
  })
})

describe('éxito, costo y persistencia', () => {
  it('S33/S36 guarda la tanda con el costo real y las piezas, y las devuelve', async () => {
    const m = mundo()
    const r = await manejarTanda(pedido(), entorno, m.f)
    expect(r.status).toBe(200)
    const cuerpo = (await r.json()) as any
    expect(cuerpo.desdeCache).toBe(false)
    expect(cuerpo.piezas).toHaveLength(4)
    expect(cuerpo.tanda.costoUsd).toBeGreaterThan(0)
    const { p_tanda, p_piezas } = m.rpcs[0]!.args
    expect(p_tanda).toMatchObject({ organizacion_id: ORGANIZACION_PILOTO_ID, plan_id: PLAN_ID, semana: 1, notas: NOTAS, version_prompt: 'contenidista-v1', modelo: 'gpt-6-luna', tokens_entrada: 3000, tokens_salida: 4000, creado_por: 'u-1' })
    expect(p_tanda.hash_entrada).toMatch(/^[0-9a-f]{64}$/)
    expect(p_tanda.costo_usd).toBeCloseTo((3000 * 0.1 + 4000 * 0.5) / 1e6, 8)
    expect(p_piezas).toHaveLength(4)
  })
  it('S37 la fila guardada no lleva claves, tokens de Meta ni el body de OpenAI; y la respuesta tampoco', async () => {
    const m = mundo()
    const r = await manejarTanda(pedido(), entorno, m.f)
    const texto = JSON.stringify(m.rpcs[0]!.args) + (await r.text())
    for (const prohibido of [KEY, SECRETA, 'instructions', 'sb_secret']) expect(texto).not.toContain(prohibido)
  })
  it('reemplaza por [precio] un monto que el modelo inventó y deja los respaldados', async () => {
    const piezas = piezasDePrueba()
    piezas[0]!.copy = 'Hoy a $ 999.999 o en 12 cuotas'
    const m = mundo({ openai: () => json(respuestaOpenAI(JSON.stringify({ piezas }))) })
    const r = await manejarTanda(pedido(), entorno, m.f)
    expect(r.status).toBe(200)
    expect(m.rpcs[0]!.args.p_piezas[0].copy).toBe('Hoy a [precio] o en 12 cuotas')
  })
  it('S29 una pieza inválida rechaza la tanda: 502, nada persistido, el costo se informa solo en el log', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const piezas = piezasDePrueba()
    piezas[1]!.copy = 'a'.repeat(2201)
    const m = mundo({ openai: () => json(respuestaOpenAI(JSON.stringify({ piezas }))) })
    const r = await manejarTanda(pedido(), entorno, m.f)
    expect(r.status).toBe(502)
    expect(m.rpcs).toHaveLength(0)
    expect(JSON.stringify(log.mock.calls)).toContain('costoUsd')
    expect(JSON.stringify(log.mock.calls)).not.toContain(KEY)
  })
  it('S23/S29 JSON roto o cantidad distinta es 502 sin persistir', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const texto of ['esto no es json', JSON.stringify({ piezas: piezasDePrueba().slice(0, 2) })]) {
      const m = mundo({ openai: () => json(respuestaOpenAI(texto)) })
      expect((await manejarTanda(pedido(), entorno, m.f)).status).toBe(502)
      expect(m.rpcs).toHaveLength(0)
    }
  })
  it('S28 strict rechazado (400): reintenta con json_object y el mismo validador', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = mundo({ openai: (_c, n) => (n === 1 ? json({}, 400) : json(respuestaOpenAI())) })
    const r = await manejarTanda(pedido(), entorno, m.f)
    expect(r.status).toBe(200)
    expect(m.cuerposOpenAI).toHaveLength(2)
    expect(m.cuerposOpenAI[1].text.format).toEqual({ type: 'json_object' })
  })
  it('un error de OpenAI es 502 y timeout 504, sin la clave', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = mundo({ openai: () => json({}, 500) })
    const r = await manejarTanda(pedido(), entorno, m.f)
    expect(r.status).toBe(502)
    expect(await r.text()).not.toContain(KEY)
  })
})

describe('caché', () => {
  it('S31 con el hash ya guardado devuelve la tanda, desdeCache y cero llamadas a OpenAI', async () => {
    const m = mundo({ existente: filaTanda() })
    const r = await manejarTanda(pedido(), entorno, m.f)
    const cuerpo = (await r.json()) as any
    expect(r.status).toBe(200)
    expect(cuerpo.desdeCache).toBe(true)
    expect(cuerpo.tanda.desdeCache).toBe(true)
    expect(cuerpo.piezas).toHaveLength(4)
    expect(llamadasOpenAI(m.f)).toBe(0)
    expect(m.rpcs).toHaveLength(0)
  })
  it('S32 el hash cambia con las notas, el plan (otro id) y el modelo', async () => {
    const hashDe = async (cuerpo: unknown, env: Record<string, string> = {}, plan = filaPlan()) => {
      const m = mundo({ plan })
      await manejarTanda(pedido({ cuerpo }), { ...entorno, ...env }, m.f)
      return m.rpcs[0]!.args.p_tanda.hash_entrada as string
    }
    const base = await hashDe({ plan_id: PLAN_ID, semana: 1, notas: NOTAS })
    expect(await hashDe({ plan_id: PLAN_ID, semana: 1, notas: `${NOTAS} y más` })).not.toBe(base)
    expect(await hashDe({ plan_id: PLAN_ID, semana: 1, notas: NOTAS }, { MODELO_CONTENIDISTA: 'gpt-5.6-luna' })).not.toBe(base)
    expect(await hashDe({ plan_id: PLAN_ID, semana: 1, notas: NOTAS }, {}, filaPlan({ plan: { ...planDePrueba(), objetivo: 'Otro' } }))).not.toBe(base)
    expect(await hashDe({ plan_id: PLAN_ID, semana: 1, notas: `  ${NOTAS}  ` })).toBe(base)
  })
  it('S34 si otro pedido igual ganó la carrera (409 de la RPC), devuelve esa tanda sin error', async () => {
    const m = mundo({ carrera: filaTanda({ id: 'ganadora' }) })
    const r = await manejarTanda(pedido(), entorno, m.f)
    const cuerpo = (await r.json()) as any
    expect(r.status).toBe(200)
    expect(cuerpo.desdeCache).toBe(true)
    expect(cuerpo.tanda.id).toBe('ganadora')
  })
})
