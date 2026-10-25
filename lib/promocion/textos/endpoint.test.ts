import { describe, it, expect, vi, afterEach } from 'vitest'
import { manejarTextos } from './endpoint'
import { HEADER_USUARIO } from '../../auth/acceso'
import { MARCAS } from '../../datos/marcas'
import { ORGANIZACION_PILOTO_ID } from '../../organizacion'
import { filaPromocion, ID_PROMO } from '../fixture'
import { hashDatos } from '../datos'

const KEY = 'sk-test-SECRETISIMA-1234'
const entorno = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_xyz', OPENAI_API_KEY: KEY }
const MARCA = MARCAS[3]!
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })

const pedido = (cuerpo: unknown = { revision: 1 }, usuario: string | null = 'u-1') =>
  new Request(`https://app.ejemplo.com/api/promociones/${ID_PROMO}/textos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(usuario ? { [HEADER_USUARIO]: usuario } : {}) },
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  })

const opcion = (o: Record<string, unknown> = {}) => ({
  titular: 'Tu próxima aventura',
  hook: 'La TRK 502 te espera',
  copy: 'Hoy a $ 4.500.000 o en 12 cuotas sin interés. Escribinos por DM.',
  hashtags: ['#benelli', '#trk502', '#quilmes'],
  cta: 'Escribinos por DM',
  altText: 'Una moto Benelli TRK 502',
  ...o,
})
const salida = (o: Record<string, unknown> = {}) => ({ opciones: [opcion(o), opcion({ titular: 'Salí a la ruta', ...o }), opcion({ titular: 'Ahora o nunca', ...o })] })
const respuestaOpenAI = (cuerpo: unknown = salida()) => ({
  status: 'completed',
  output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(cuerpo) }] }],
  usage: { input_tokens: 800, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens: 700 },
})

function mundo(o: {
  rol?: string | null
  promo?: Record<string, unknown> | null
  openai?: () => Response | Promise<Response>
  cache?: unknown
  ultimoIntento?: number | null
  carrera?: unknown
  analisis?: Record<string, unknown> | null
  ediciones?: unknown[]
} = {}) {
  const insertados: Record<string, unknown>[] = []
  const rpcs: any[] = []
  let selectsHash = 0
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    if (url.hostname === 'api.openai.com') return (o.openai ?? (() => json(respuestaOpenAI())))()
    if (url.hostname !== 'abc.supabase.co') throw new Error(`host inesperado ${url.hostname}`)
    if (url.pathname === '/rest/v1/miembros') return json(o.rol === null ? [] : [{ rol: o.rol ?? 'director' }])
    if (url.pathname === '/rest/v1/promociones') return json(o.promo === null ? [] : [filaPromocion({ id: ID_PROMO, marca_id: MARCA.id, ...o.promo })])
    if (url.pathname === '/rest/v1/analisis') return json(o.analisis === null ? [] : [{ id: 'an1', contenido: 'Los reels rindieron más.', modelo: 'gpt-6-luna', costo_usd: '0.001', tokens_entrada: 1, tokens_salida: 1, creado_en: '2026-10-25T10:00:00+00:00', filtros: {}, ...o.analisis }])
    if (url.pathname === '/rest/v1/ediciones_analisis') return json(o.ediciones ?? [])
    if (url.pathname === '/rest/v1/rpc/editar_promocion') {
      const args = JSON.parse(String(init?.body))
      rpcs.push(args)
      return json(filaPromocion({ id: ID_PROMO, revision: args.p_revision + 1, textos_id: args.p_campos.textos_id }))
    }
    if (url.pathname === '/rest/v1/textos_promocion') {
      if (init?.method === 'POST') {
        if (o.carrera) return json({ message: 'duplicate key' }, 409)
        const fila = JSON.parse(String(init.body)) as Record<string, unknown>
        insertados.push(fila)
        return json([{ ...fila, id: 'tx-nuevo', creado_en: '2026-10-25T15:00:01+00:00' }], 201)
      }
      if (url.searchParams.has('hash_entrada')) {
        selectsHash += 1
        if (o.carrera) return json(selectsHash === 1 ? [] : [o.carrera])
        return json(o.cache ? [o.cache] : [])
      }
      return json(o.ultimoIntento == null ? [] : [{ intento: o.ultimoIntento }])
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, insertados, rpcs }
}

const cacheado = (o: Record<string, unknown> = {}) => ({
  id: 'tx-previo', promocion_id: ID_PROMO, intento: 1, opciones: salida().opciones, costo_usd: '0.0031', datos_hash: hashDatos(filaPromocion().datos), creado_en: '2026-10-25T10:00:00+00:00', ...o,
})
const aOpenAI = (f: ReturnType<typeof mundo>['f']) => f.mock.calls.filter(([u]) => new URL(String(u)).hostname === 'api.openai.com')
const llamar = (m: ReturnType<typeof mundo>, cuerpo: unknown = { revision: 1 }, id = ID_PROMO, usuario: string | null = 'u-1', env: Record<string, string> = entorno) =>
  manejarTextos(pedido(cuerpo, usuario), id, env, m.f)

afterEach(() => vi.restoreAllMocks())

describe('rechazos: cero llamadas a OpenAI (regla #3)', () => {
  it('sin sesión 401, lector 403', async () => {
    const m = mundo()
    expect((await llamar(m, { revision: 1 }, ID_PROMO, null)).status).toBe(401)
    const m2 = mundo({ rol: 'lector' })
    expect((await llamar(m2)).status).toBe(403)
    expect(aOpenAI(m.f)).toHaveLength(0)
    expect(aOpenAI(m2.f)).toHaveLength(0)
  })
  it('sin OPENAI_API_KEY 503', async () => {
    const m = mundo()
    expect((await llamar(m, { revision: 1 }, ID_PROMO, 'u-1', { ...entorno, OPENAI_API_KEY: '' })).status).toBe(503)
    expect(aOpenAI(m.f)).toHaveLength(0)
  })
  it('body sin revisión o roto es 400', async () => {
    for (const c of [{}, { revision: 0 }, { revision: '1' }, 'no json', { revision: 1, otras: 'si' }]) {
      const m = mundo()
      expect((await llamar(m, c)).status, JSON.stringify(c)).toBe(400)
      expect(aOpenAI(m.f)).toHaveLength(0)
    }
  })
  it('promoción inexistente o con id inválido 404; aprobada 409; revisión vieja 409', async () => {
    const casos: [ReturnType<typeof mundo>, number, string?][] = [
      [mundo({ promo: null }), 404],
      [mundo({ promo: { estado: 'aprobada' } }), 409],
      [mundo({ promo: { revision: 4 } }), 409],
      [mundo(), 404, 'abc'],
    ]
    for (const [m, status, id] of casos) {
      expect((await llamar(m, { revision: 1 }, id ?? ID_PROMO)).status).toBe(status)
      expect(aOpenAI(m.f)).toHaveLength(0)
    }
  })
  it('después de 20 vueltas no se pide más', async () => {
    const m = mundo({ ultimoIntento: 20 })
    const r = await llamar(m, { revision: 1, otras: true })
    expect(r.status).toBe(422)
    expect(aOpenAI(m.f)).toHaveLength(0)
  })
})

describe('el pedido al redactor', () => {
  it('manda los datos, el precio formateado y los aprendizajes vigentes; store:false y la clave en el header', async () => {
    const m = mundo({
      promo: { analisis_id: 'an1', datos: { precio: { moneda: 'ARS', monto: 4_500_000 }, promo: { tipo: 'cuotas', detalle: '12 cuotas sin interés' }, lugar: 'Quilmes', indicaciones: 'Hay stock' } },
      ediciones: [{ id: 'e2', analisis_id: 'an1', version: 2, contenido: 'Texto editado del análisis', editado_por: 'u', editado_en: '2026-10-25T11:00:00+00:00' }],
    })
    await llamar(m)
    const [, init] = aOpenAI(m.f)[0]!
    const enviado = JSON.parse(String(init!.body))
    expect(enviado.store).toBe(false)
    expect(enviado.text.format).toMatchObject({ type: 'json_schema', strict: true })
    expect((init!.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`)
    expect(enviado.input).toContain('$ 4.500.000')
    expect(enviado.input).toContain('Texto editado del análisis')
    expect(enviado.input).toContain('Hay stock')
    expect(enviado.input).toContain(MARCA.usuarioIg)
    expect(enviado.input).not.toMatch(/sk-|sb_secret/)
  })
  it('los aprendizajes se recortan a 2000 caracteres', async () => {
    const m = mundo({ promo: { analisis_id: 'an1' }, analisis: { contenido: 'x'.repeat(5000) } })
    await llamar(m)
    const enviado = JSON.parse(String(aOpenAI(m.f)[0]![1]!.body))
    expect(enviado.input.match(/x+/)![0]).toHaveLength(2000)
  })
})

describe('guardar y vincular', () => {
  it('guarda las 3 opciones con costo, hash, datos_hash e intento 1 y las vincula; NO elige ninguna', async () => {
    const m = mundo()
    const r = await llamar(m)
    expect(r.status).toBe(200)
    expect(m.insertados).toHaveLength(1)
    expect(m.insertados[0]).toMatchObject({
      organizacion_id: ORGANIZACION_PILOTO_ID,
      promocion_id: ID_PROMO,
      version_prompt: 'promocion-textos-v1',
      intento: 1,
      datos_hash: hashDatos(filaPromocion().datos),
      creado_por: 'u-1',
    })
    expect((m.insertados[0] as any).opciones).toHaveLength(3)
    expect(Number((m.insertados[0] as any).costo_usd)).toBeGreaterThan(0)
    expect(m.rpcs).toEqual([{ p_id: ID_PROMO, p_revision: 1, p_campos: { textos_id: 'tx-nuevo' }, p_usuario: 'u-1' }])
    const b = (await r.json()) as any
    expect(b.textos).toMatchObject({ id: 'tx-nuevo', desdeCache: false, intento: 1, desactualizado: false })
    expect(b.textos.opciones).toHaveLength(3)
    expect(b.textos.costoUsd).toBeGreaterThan(0)
    expect(b.promocion.copy).toBeNull()
    expect(JSON.stringify(b)).not.toContain(KEY)
  })

  it('un monto inventado se guarda como [precio]; el precio cargado queda', async () => {
    const m = mundo({ openai: () => json(respuestaOpenAI(salida({ copy: 'Antes $ 6.000.000, hoy $ 4.500.000.' }))) })
    const r = await llamar(m)
    expect(r.status).toBe(200)
    expect((m.insertados[0] as any).opciones[0].copy).toBe('Antes [precio], hoy $ 4.500.000.')
  })

  it('textos inválidos: 502, nada se guarda y el costo queda en el log', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = mundo({ openai: () => json(respuestaOpenAI({ opciones: [opcion()] })) })
    const r = await llamar(m)
    expect(r.status).toBe(502)
    expect(((await r.json()) as any).error).toBe('El redactor devolvió textos inválidos. Probá de nuevo.')
    expect(m.insertados).toHaveLength(0)
    expect(m.rpcs).toHaveLength(0)
    expect(JSON.stringify(log.mock.calls)).toMatch(/costoUsd/)
  })

  it('el titular con un precio es inválido', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = mundo({ openai: () => json(respuestaOpenAI(salida({ titular: 'Desde $ 4.500.000' }))) })
    expect((await llamar(m)).status).toBe(502)
  })

  it('si el JSON no se puede leer: 502', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = mundo({ openai: () => json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'no es json' }] }], usage: {} }) })
    expect((await llamar(m)).status).toBe(502)
  })
})

describe('caché y otras 3', () => {
  it('mismos datos y misma vuelta: devuelve lo guardado, costo 0 y sin llamar a OpenAI', async () => {
    const m = mundo({ cache: cacheado(), ultimoIntento: 1 })
    const r = await llamar(m)
    const b = (await r.json()) as any
    expect(r.status).toBe(200)
    expect(b.textos).toMatchObject({ id: 'tx-previo', desdeCache: true, costoUsd: 0 })
    expect(aOpenAI(m.f)).toHaveLength(0)
    expect(m.insertados).toHaveLength(0)
    expect(m.rpcs[0].p_campos).toEqual({ textos_id: 'tx-previo' })
  })
  it('si ya está vinculado no vuelve a editar la promoción', async () => {
    const m = mundo({ cache: cacheado(), ultimoIntento: 1, promo: { textos_id: 'tx-previo' } })
    await llamar(m)
    expect(m.rpcs).toHaveLength(0)
  })
  it('avisa si los datos cambiaron desde que se escribieron los textos', async () => {
    const m = mundo({ cache: cacheado({ datos_hash: 'otro' }), ultimoIntento: 1 })
    const b = (await (await llamar(m)).json()) as any
    expect(b.textos.desactualizado).toBe(true)
  })
  it('"otras" sube el intento, llama de nuevo y le avisa al modelo la vuelta', async () => {
    const m = mundo({ ultimoIntento: 1 })
    const r = await llamar(m, { revision: 1, otras: true })
    expect(r.status).toBe(200)
    expect(aOpenAI(m.f)).toHaveLength(1)
    expect((m.insertados[0] as any).intento).toBe(2)
    expect(JSON.parse(String(aOpenAI(m.f)[0]![1]!.body)).input).toContain('"vuelta":2')
  })
  it('"otras" sin una tanda previa es la primera vuelta', async () => {
    const m = mundo({ ultimoIntento: null })
    await llamar(m, { revision: 1, otras: true })
    expect((m.insertados[0] as any).intento).toBe(1)
  })
  it('doble click: si otro pedido ganó la carrera se devuelve ese', async () => {
    const m = mundo({ carrera: cacheado() })
    const r = await llamar(m)
    expect(r.status).toBe(200)
    expect(((await r.json()) as any).textos.desdeCache).toBe(true)
  })
})

describe('errores', () => {
  it('OpenAI: la clave rechazada es 502 sin repetir el texto de OpenAI', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = mundo({ openai: () => json({ error: { message: 'Incorrect API key sk-test-SECRETISIMA' } }, 401) })
    const r = await llamar(m)
    expect(r.status).toBe(502)
    expect(await r.text()).not.toContain('SECRETISIMA')
  })
  it('un fallo de la base es 500 sin filtrar detalles', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = mundo()
    const f = vi.fn<typeof fetch>(async (u, init) => {
      if (new URL(String(u)).pathname === '/rest/v1/textos_promocion' && init?.method === 'POST') return json({ message: 'boom interno' }, 500)
      return m.f(u, init)
    })
    const r = await manejarTextos(pedido(), ID_PROMO, entorno, f)
    expect(r.status).toBe(500)
    expect(await r.text()).not.toContain('boom')
  })
})
