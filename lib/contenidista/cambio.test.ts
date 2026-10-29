import { describe, it, expect, vi, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import { fusionarCambio, manejarCambioPiezaIA } from './cambio'
import { INSTRUCCIONES_CAMBIO_PIEZA, VERSION_PROMPT_CAMBIO_PIEZA } from './prompt-cambio'
import { HEADER_USUARIO } from '../auth/acceso'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { contextoDePrueba, planDePrueba, piezasDePrueba } from './fixture'

const ID = '22222222-2222-4222-8222-222222222222'
const NUEVA = '33333333-3333-4333-8333-333333333333'
const PLAN_ID = '11111111-1111-4111-8111-111111111111'
const KEY = 'sk-test-SECRETISIMA-1234'
const entorno = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_xyz', OPENAI_API_KEY: KEY }
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })

const base = piezasDePrueba()[1]! // instagram imagen, con altText, "La moto de la semana."
const fila = (o: Record<string, unknown> = {}) => ({
  id: ID, raiz_id: ID, padre_id: null, tanda_id: 't1', plan_id: PLAN_ID, semana: 1, orden: 2, version: 1,
  origen: 'agente', estado: 'borrador', pieza: base, creado_en: '2026-10-21T10:00:00+00:00', aprobado_en: null,
  organizacion_id: ORGANIZACION_PILOTO_ID, ...o,
})
const salidaModelo = (o: Record<string, unknown> = {}) => ({
  hook: 'Mirá cómo nace una moto', copy: 'La moto de la semana, más oscura y de noche.', hashtags: ['#motos'], cta: 'Escribinos por DM',
  guion: null, briefVisual: 'Plano general del taller, de noche', altText: 'Una moto roja en el salón de noche', ...o,
})
const respuestaOpenAI = (cuerpo: unknown = salidaModelo()) => ({
  status: 'completed',
  output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(cuerpo) }] }],
  usage: { input_tokens: 1500, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens: 600 },
})

const pedido = (cuerpo: unknown = { instruccion: 'más oscuro, de noche', version: 1 }, usuario: string | null = 'u-1') =>
  new Request(`https://app.ejemplo.com/api/piezas/${ID}/cambio`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(usuario ? { [HEADER_USUARIO]: usuario } : {}) },
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  })

type Mundo = { rol?: string | null; fila?: Record<string, unknown> | null; openai?: () => Response; abrir?: number; editar?: number; previos?: unknown[] }
function mundo(o: Mundo = {}) {
  const rpcs: Record<string, any[]> = {}
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    if (url.hostname === 'api.openai.com') return (o.openai ?? (() => json(respuestaOpenAI())))()
    if (url.pathname === '/rest/v1/miembros') return json(o.rol === null ? [] : [{ rol: o.rol ?? 'director' }])
    if (url.pathname === '/rest/v1/piezas') return json(o.fila === null ? [] : [fila(o.fila ?? {})])
    if (url.pathname === '/rest/v1/planes') return json([{ id: PLAN_ID, estado: 'aprobado', plan: planDePrueba() }])
    if (url.pathname === '/rest/v1/turnos_conversacion') return json(o.previos ?? [])
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const nombre = url.pathname.split('/').pop()!
      ;(rpcs[nombre] ??= []).push(JSON.parse(String(init?.body)))
      if (nombre === 'abrir_turno') return o.abrir ? json({ message: 'x' }, o.abrir) : json({ conversacionId: 'c1', turnoId: 't1', turno: 1 })
      if (nombre === 'editar_pieza') {
        if (o.editar) return json({ message: 'x' }, o.editar)
        return json(fila({ id: NUEVA, padre_id: ID, version: 2, origen: 'edicion', pieza: rpcs[nombre]!.at(-1).p_pieza }))
      }
      return json(null)
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, rpcs }
}
const aOpenAI = (m: ReturnType<typeof mundo>) => m.f.mock.calls.filter(([u]) => new URL(String(u)).hostname === 'api.openai.com')
const llamar = (m: ReturnType<typeof mundo>, cuerpo?: unknown, usuario: string | null = 'u-1', env: Record<string, string> = entorno, id = ID) =>
  manejarCambioPiezaIA(pedido(cuerpo, usuario), id, env, m.f)

afterEach(() => vi.restoreAllMocks())

describe('rechazos: cero OpenAI, ningún turno, nada escrito', () => {
  const casos: [string, () => Promise<[Response, ReturnType<typeof mundo>]>, number][] = [
    ['sin sesión', async () => { const m = mundo(); return [await llamar(m, undefined, null), m] }, 401],
    ['lector', async () => { const m = mundo({ rol: 'lector' }); return [await llamar(m), m] }, 403],
    ['sin OPENAI_API_KEY', async () => { const m = mundo(); return [await llamar(m, undefined, 'u-1', { ...entorno, OPENAI_API_KEY: '' }), m] }, 503],
    ['pedido corto', async () => { const m = mundo(); return [await llamar(m, { instruccion: 'ab', version: 1 }), m] }, 400],
    ['sin versión', async () => { const m = mundo(); return [await llamar(m, { instruccion: 'más oscuro' }), m] }, 400],
    ['pieza inexistente', async () => { const m = mundo({ fila: null }); return [await llamar(m), m] }, 404],
    ['versión vieja', async () => { const m = mundo({ fila: { version: 2 } }); return [await llamar(m), m] }, 409],
    ['pieza descartada', async () => { const m = mundo({ fila: { estado: 'descartada' } }); return [await llamar(m), m] }, 409],
    ['pieza reemplazada', async () => { const m = mundo({ fila: { estado: 'reemplazada' } }); return [await llamar(m), m] }, 409],
    ['id que no es uuid', async () => { const m = mundo(); return [await llamar(m, undefined, 'u-1', entorno, 'abc'), m] }, 404],
  ]
  it.each(casos)('%s', async (_n, correr, status) => {
    const [r, m] = await correr()
    expect(r.status).toBe(status)
    expect(aOpenAI(m)).toHaveLength(0)
    expect(m.rpcs.abrir_turno).toBeUndefined()
    expect(m.rpcs.editar_pieza).toBeUndefined()
  })

  it.each([409, 429])('abrir_turno %s: cero OpenAI y nada escrito', async (status) => {
    const m = mundo({ abrir: status })
    expect((await llamar(m)).status).toBe(status)
    expect(aOpenAI(m)).toHaveLength(0)
    expect(m.rpcs.editar_pieza).toBeUndefined()
  })
})

describe('lo que se le manda a OpenAI', () => {
  it('instrucciones fijas, la pieza actual y el pedido; sin ids, fecha, idea de origen ni clave', async () => {
    const m = mundo({ previos: [{ turno: 1, pedido: 'más corto', estado: 'ok' }] })
    await llamar(m)
    const [url, init] = aOpenAI(m)[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/responses')
    const cuerpo = JSON.parse(String(init.body))
    expect(cuerpo.instructions).toBe(INSTRUCCIONES_CAMBIO_PIEZA)
    expect(INSTRUCCIONES_CAMBIO_PIEZA).toContain(VERSION_PROMPT_CAMBIO_PIEZA)
    expect(cuerpo.store).toBe(false)
    expect(cuerpo.text.format).toMatchObject({ type: 'json_schema', strict: true })
    const entrada: string = cuerpo.input
    expect(entrada).toContain('Cambio que pide la persona ahora: «más oscuro, de noche»')
    expect(entrada).toContain('«más corto»')
    expect(entrada).toContain(base.copy)
    expect(entrada).toContain(base.briefVisual)
    const todo = JSON.stringify(cuerpo)
    expect(todo).not.toContain(base.ideaOrigen)
    expect(todo).not.toContain(base.fecha)
    expect(todo).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    expect(todo).not.toContain(KEY)
    expect(todo).not.toContain('u-1')
  })

  it('el texto de las instrucciones está congelado: si cambia, hay que subir la versión', () => {
    expect(VERSION_PROMPT_CAMBIO_PIEZA).toBe('contenidista-cambio-v1')
    expect(createHash('sha256').update(INSTRUCCIONES_CAMBIO_PIEZA).digest('hex')).toBe('9e39a4763f45af9d3db23b7d52baaed027144e41fa094788fc418437d226f6ad')
  })
})

describe('el resultado', () => {
  it('OK: editar_pieza con la versión que se veía (versión nueva en borrador) y turno cerrado con {piezaId, version, antes, despues}', async () => {
    const m = mundo()
    const r = await llamar(m)
    expect(r.status).toBe(200)
    expect(m.rpcs.editar_pieza![0]).toMatchObject({ p_id: ID, p_version: 1, p_usuario: 'u-1' })
    expect(m.rpcs.editar_pieza![0].p_pieza).toMatchObject({ marca: base.marca, plataforma: base.plataforma, formato: base.formato, fecha: base.fecha, ideaOrigen: base.ideaOrigen, copy: 'La moto de la semana, más oscura y de noche.' })
    const cierre = m.rpcs.cerrar_turno![0]
    expect(cierre).toMatchObject({ p_turno: 't1', p_version: VERSION_PROMPT_CAMBIO_PIEZA })
    expect(cierre.p_respuesta).toMatchObject({ piezaId: NUEVA, version: 2, antes: { copy: base.copy }, despues: { copy: 'La moto de la semana, más oscura y de noche.' } })
    expect(cierre.p_costo).toBeGreaterThan(0)
    const c = await r.json()
    expect(c.pieza).toMatchObject({ id: NUEVA, version: 2 })
    expect(JSON.stringify(c)).not.toContain(KEY)
  })

  it('una pieza APROBADA también se puede cambiar: sale una versión nueva en borrador y la aprobada sigue (lo hace editar_pieza)', async () => {
    const m = mundo({ fila: { estado: 'aprobada' } })
    expect((await llamar(m)).status).toBe(200)
    expect(m.rpcs.editar_pieza).toHaveLength(1)
  })

  it('un monto que el modelo inventó se cambia por [precio] y la pieza igual se guarda', async () => {
    const m = mundo({ openai: () => json(respuestaOpenAI(salidaModelo({ copy: 'La moto de la semana a $ 999.999.' }))) })
    expect((await llamar(m)).status).toBe(200)
    expect(m.rpcs.editar_pieza![0].p_pieza.copy).toBe('La moto de la semana a [precio].')
  })

  it('una pieza inválida (hashtag roto): 502, fallar_turno con el costo real, nada escrito', async () => {
    const m = mundo({ openai: () => json(respuestaOpenAI(salidaModelo({ hashtags: ['sin-numeral'] }))) })
    const r = await llamar(m)
    expect(r.status).toBe(502)
    expect(m.rpcs.editar_pieza).toBeUndefined()
    expect(m.rpcs.cerrar_turno).toBeUndefined()
    expect(m.rpcs.fallar_turno![0].p_costo).toBeGreaterThan(0)
  })

  it('error de OpenAI: 502 y fallar_turno con costo 0', async () => {
    const m = mundo({ openai: () => json({}, 500) })
    expect((await llamar(m)).status).toBe(502)
    expect(m.rpcs.fallar_turno![0].p_costo).toBe(0)
    expect(m.rpcs.editar_pieza).toBeUndefined()
  })

  it('409 al aplicar (la pieza cambió mientras se pedía): fallar_turno con costo y 409', async () => {
    const m = mundo({ editar: 409 })
    expect((await llamar(m)).status).toBe(409)
    expect(m.rpcs.fallar_turno![0].p_costo).toBeGreaterThan(0)
  })
})

describe('fusionarCambio', () => {
  const ctx = contextoDePrueba()
  it('lo que el modelo no devuelve (marca, plataforma, formato, fecha, idea) sale de la base', () => {
    const r = fusionarCambio(base, salidaModelo(), 'pedido', ctx)
    expect(r.ok && r.pieza).toMatchObject({ marca: base.marca, plataforma: base.plataforma, formato: base.formato, fecha: base.fecha, ideaOrigen: base.ideaOrigen })
  })
  it('guion y altText respetan el formato de la base aunque el modelo devuelva otra cosa', () => {
    const r = fusionarCambio(base, salidaModelo({ guion: '1. escena' }), 'pedido', ctx)
    expect(r.ok && r.pieza.guion).toBeNull()
  })
  it('una historia sigue sin copy ni hashtags', () => {
    const historia = { ...base, formato: 'historia' as const, copy: '', hashtags: [], altText: null }
    const r = fusionarCambio(historia, salidaModelo({ copy: 'algo', hashtags: ['#a'], altText: 'x' }), 'pedido', ctx)
    expect(r.ok && [r.pieza.copy, r.pieza.hashtags]).toEqual(['', []])
  })
  it('forma inválida: claves de más o de menos, tipos mal', () => {
    expect(fusionarCambio(base, { ...salidaModelo(), extra: 1 }, 'p', ctx).ok).toBe(false)
    expect(fusionarCambio(base, { hook: 'x' }, 'p', ctx).ok).toBe(false)
    expect(fusionarCambio(base, salidaModelo({ hashtags: 'no' }), 'p', ctx).ok).toBe(false)
    expect(fusionarCambio(base, null, 'p', ctx).ok).toBe(false)
  })
})
