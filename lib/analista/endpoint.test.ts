import { describe, it, expect, vi, afterEach } from 'vitest'
import { manejarAnalisis } from './endpoint'
import { HEADER_USUARIO } from '../auth/acceso'
import { MARCAS } from '../datos/marcas'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'

const KEY = 'sk-test-SECRETISIMA-1234'
const entorno = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_xyz',
  OPENAI_API_KEY: KEY,
}
const AHORA = new Date('2026-10-20T15:00:00Z')
const MARCA = MARCAS[2]!

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })

const pedido = (opciones: { usuario?: string | null; cuerpo?: unknown } = {}) => {
  const usuario = opciones.usuario === undefined ? 'u-1' : opciones.usuario
  return new Request('https://app.ejemplo.com/api/analisis', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(usuario ? { [HEADER_USUARIO]: usuario } : {}) },
    body: JSON.stringify(opciones.cuerpo ?? { marca: MARCA.id, plataforma: 'todas', desde: '2026-09-21', hasta: '2026-10-20' }),
  })
}

const filaPost = (o: Record<string, unknown> = {}) => ({
  publicacion_id: 'ID-INTERNO-POST',
  cuenta_meta_id: MARCA.id,
  plataforma: 'instagram',
  tipo: 'reel',
  texto: 'Nueva moto',
  permalink: 'https://instagram.com/p/PERMALINK-SECRETO',
  publicado_en: '2026-10-03T15:00:00+00:00',
  vistas: 1000,
  alcance: 800,
  clics: null,
  me_gusta: 50,
  comentarios: 5,
  compartidos: 2,
  guardados: 3,
  ...o,
})

const filaCampania = {
  campania_id: 'ID-INTERNO-CAMP',
  campania: 'Tráfico',
  cuenta: 'CUENTA-INTERNA',
  objetivo: 'OUTCOME_TRAFFIC',
  estado: 'ACTIVE',
  gasto: '1500.50',
  impresiones: 10000,
  clics: 100,
  resultados: 10,
  dias: 10,
  ultimo_dia: '2026-10-19',
}

const respuestaOpenAI = () => ({
  status: 'completed',
  output: [{ type: 'message', content: [{ type: 'output_text', text: 'Resumen: todo bien.' }] }],
  usage: { input_tokens: 3000, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens: 2000 },
})

/** Supabase + OpenAI falsos, enrutados por URL. Guarda lo insertado. */
function mundo(o: {
  rol?: string | null
  posts?: unknown[]
  campanias?: unknown[]
  mensajes?: unknown[]
  ediciones?: unknown[]
  existente?: unknown | null
  /** El primer select de caché no ve nada, pero el insert choca (doble click). */
  carrera?: unknown
  openai?: () => Response | Promise<Response>
} = {}) {
  const insertados: Record<string, unknown>[] = []
  let selectsAnalisis = 0
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    if (url.hostname === 'api.openai.com') return (o.openai ?? (() => json(respuestaOpenAI())))()
    if (url.pathname === '/rest/v1/miembros') {
      return json(o.rol === null ? [] : [{ rol: o.rol ?? 'director' }])
    }
    if (url.pathname.endsWith('/rpc/resumen_publicaciones')) return json(o.posts ?? [filaPost()])
    if (url.pathname.endsWith('/rpc/resumen_publicidad')) return json(o.campanias ?? [filaCampania])
    if (url.pathname.endsWith('/rpc/resumen_mensajes')) return json(o.mensajes ?? [])
    if (url.pathname === '/rest/v1/ediciones_analisis') return json(o.ediciones ?? [])
    if (url.pathname === '/rest/v1/sincronizaciones') return json([])
    if (url.pathname === '/rest/v1/analisis') {
      if (init?.method === 'POST') {
        if (o.carrera) return json({ message: 'duplicate key value violates unique constraint' }, 409)
        const fila = JSON.parse(String(init.body)) as Record<string, unknown>
        insertados.push(fila)
        return json([{ ...fila, id: 'nuevo', creado_en: '2026-10-20T15:00:01+00:00' }], 201)
      }
      selectsAnalisis += 1
      if (o.carrera) return json(selectsAnalisis === 1 ? [] : [o.carrera])
      return json(o.existente ? [o.existente] : [])
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, insertados }
}

const existente = (o: Record<string, unknown> = {}) => ({
  id: 'previo',
  contenido: 'Análisis guardado',
  modelo: 'gpt-6-luna',
  costo_usd: '0.0013',
  tokens_entrada: 3000,
  tokens_salida: 2000,
  creado_en: '2026-10-19T15:00:00+00:00',
  filtros: {},
  ...o,
})

const llamadasA = (f: ReturnType<typeof mundo>['f'], host: string) =>
  f.mock.calls.filter(([u]) => new URL(String(u)).hostname === host)

afterEach(() => vi.restoreAllMocks())

describe('manejarAnalisis · acceso', () => {
  it('sin x-usuario-id responde 401 y no toca nada', async () => {
    const m = mundo()
    const r = await manejarAnalisis(pedido({ usuario: null }), entorno, m.f, AHORA)
    expect(r.status).toBe(401)
    expect(m.f).not.toHaveBeenCalled()
  })

  it('un lector recibe 403 y no se llama a OpenAI', async () => {
    const m = mundo({ rol: 'lector' })
    const r = await manejarAnalisis(pedido(), entorno, m.f, AHORA)
    expect(r.status).toBe(403)
    expect(llamadasA(m.f, 'api.openai.com')).toHaveLength(0)
  })

  it('sin membresía recibe 403', async () => {
    const m = mundo({ rol: null })
    expect((await manejarAnalisis(pedido(), entorno, m.f, AHORA)).status).toBe(403)
  })

  it.each(['director', 'operador'])('el rol %s puede analizar', async (rol) => {
    const m = mundo({ rol })
    expect((await manejarAnalisis(pedido(), entorno, m.f, AHORA)).status).toBe(200)
  })

  it('consulta el rol del usuario del header en la organización piloto', async () => {
    const m = mundo()
    await manejarAnalisis(pedido({ usuario: 'u-77' }), entorno, m.f, AHORA)
    const url = new URL(String(m.f.mock.calls.find(([u]) => String(u).includes('/miembros'))![0]))
    expect(url.searchParams.get('usuario_id')).toBe('eq.u-77')
    expect(url.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
  })
})

describe('manejarAnalisis · configuración', () => {
  it('sin variables de Supabase responde 500', async () => {
    const { SUPABASE_SECRET_KEY: _, ...sin } = entorno
    expect((await manejarAnalisis(pedido(), sin, mundo().f, AHORA)).status).toBe(500)
  })

  it('sin OPENAI_API_KEY responde 503', async () => {
    const { OPENAI_API_KEY: _, ...sin } = entorno
    expect((await manejarAnalisis(pedido(), sin, mundo().f, AHORA)).status).toBe(503)
  })

  it('un modelo sin precio responde 500 ANTES de llamar a OpenAI (nunca costo 0)', async () => {
    const m = mundo()
    const r = await manejarAnalisis(pedido(), { ...entorno, MODELO_ANALISTA: 'modelo-inventado' }, m.f, AHORA)
    expect(r.status).toBe(500)
    expect(llamadasA(m.f, 'api.openai.com')).toHaveLength(0)
    expect(m.insertados).toHaveLength(0)
  })

  it('sin MODELO_ANALISTA usa gpt-6-luna', async () => {
    const m = mundo()
    await manejarAnalisis(pedido(), entorno, m.f, AHORA)
    const body = JSON.parse(String(llamadasA(m.f, 'api.openai.com')[0]![1]?.body))
    expect(body.model).toBe('gpt-6-luna')
  })
})

describe('manejarAnalisis · flujo', () => {
  it('sin publicaciones ni campañas responde 422 y no llama al LLM', async () => {
    const m = mundo({ posts: [], campanias: [] })
    const r = await manejarAnalisis(pedido(), entorno, m.f, AHORA)
    expect(r.status).toBe(422)
    expect(llamadasA(m.f, 'api.openai.com')).toHaveLength(0)
  })

  it('lee las RPC con el rango de los filtros (p_desde y p_hasta)', async () => {
    const m = mundo()
    await manejarAnalisis(pedido({ cuerpo: { marca: MARCA.id, desde: '2026-09-21', hasta: '2026-10-10' } }), entorno, m.f, AHORA)
    const rpcs = m.f.mock.calls.filter(([u]) => String(u).includes('/rpc/'))
    expect(rpcs).toHaveLength(3)
    for (const [, init] of rpcs) {
      expect(JSON.parse(String(init?.body))).toMatchObject({ p_desde: '2026-09-21', p_hasta: '2026-10-10' })
    }
  })

  it('un body inválido no rompe: usa los filtros por defecto', async () => {
    const m = mundo()
    const req = new Request('https://app.ejemplo.com/api/analisis', {
      method: 'POST',
      headers: { [HEADER_USUARIO]: 'u-1' },
      body: 'esto no es json',
    })
    expect((await manejarAnalisis(req, entorno, m.f, AHORA)).status).toBe(200)
  })

  it('miss: llama a OpenAI, guarda con costo y creado_por, y responde desdeCache false', async () => {
    const m = mundo()
    const r = await manejarAnalisis(pedido({ usuario: 'u-9' }), entorno, m.f, AHORA)
    expect(r.status).toBe(200)
    const cuerpo = await r.json()
    expect(cuerpo.desdeCache).toBe(false)
    expect(cuerpo.analisis).toMatchObject({ contenido: 'Resumen: todo bien.', modelo: 'gpt-6-luna', costoUsd: 0.0013, desdeCache: false })

    expect(m.insertados).toHaveLength(1)
    expect(m.insertados[0]).toMatchObject({
      organizacion_id: ORGANIZACION_PILOTO_ID,
      tipo: 'rendimiento',
      rango_desde: '2026-09-21',
      rango_hasta: '2026-10-20',
      version_prompt: 'analista-v2',
      modelo: 'gpt-6-luna',
      contenido: 'Resumen: todo bien.',
      tokens_entrada: 3000,
      tokens_salida: 2000,
      costo_usd: 0.0013,
      creado_por: 'u-9',
      tokens_cacheados: 0,
      tokens_razonamiento: 0,
      filtros: { marcaId: MARCA.id, plataforma: 'todas', desde: '2026-09-21', hasta: '2026-10-20' },
    })
    expect(String(m.insertados[0]!.hash_entrada)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('hit de caché: no llama a OpenAI, no inserta, costo nuevo 0', async () => {
    const m = mundo({ existente: existente() })
    const r = await manejarAnalisis(pedido(), entorno, m.f, AHORA)
    expect(r.status).toBe(200)
    const cuerpo = await r.json()
    expect(cuerpo.desdeCache).toBe(true)
    expect(cuerpo.analisis).toMatchObject({ id: 'previo', contenido: 'Análisis guardado', desdeCache: true })
    expect(llamadasA(m.f, 'api.openai.com')).toHaveLength(0)
    expect(m.insertados).toHaveLength(0)
  })

  it('hit de caché de un análisis editado: devuelve la versión vigente, no el original', async () => {
    const m = mundo({
      existente: existente(),
      ediciones: [{ id: 'e2', analisis_id: 'previo', version: 2, contenido: 'Corregido por Julián', editado_por: 'u-2', editado_en: '2026-10-20T09:00:00+00:00' }],
    })
    const cuerpo = await (await manejarAnalisis(pedido(), entorno, m.f, AHORA)).json()
    expect(cuerpo.analisis).toMatchObject({ contenido: 'Corregido por Julián', original: 'Análisis guardado', version: 2 })
  })

  it('el caché se busca por el hash de la organización', async () => {
    const m = mundo()
    await manejarAnalisis(pedido(), entorno, m.f, AHORA)
    const sel = m.f.mock.calls.map(([u]) => new URL(String(u))).find((u) => u.pathname === '/rest/v1/analisis')!
    expect(sel.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
    expect(sel.searchParams.get('hash_entrada')).toMatch(/^eq\.[0-9a-f]{64}$/)
  })

  it('filtros distintos generan un hash distinto (miss)', async () => {
    const a = mundo()
    const b = mundo()
    await manejarAnalisis(pedido(), entorno, a.f, AHORA)
    await manejarAnalisis(pedido({ cuerpo: { marca: MARCA.id, plataforma: 'instagram', desde: '2026-09-21', hasta: '2026-10-20' } }), entorno, b.f, AHORA)
    expect(a.insertados[0]!.hash_entrada).not.toBe(b.insertados[0]!.hash_entrada)
  })

  it('doble click: si el insert choca (409) devuelve el existente sin error ni segundo cobro', async () => {
    const m = mundo({ carrera: existente({ id: 'ganador' }) })
    const r = await manejarAnalisis(pedido(), entorno, m.f, AHORA)
    expect(r.status).toBe(200)
    expect((await r.json()).analisis.id).toBe('ganador')
    expect(m.insertados).toHaveLength(0)
  })
})

describe('manejarAnalisis · regla #2 y capa 2', () => {
  it('a OpenAI le llega solo el agregado: sin ids, permalinks ni cuentas, y bajo 12.000 caracteres', async () => {
    const m = mundo()
    await manejarAnalisis(pedido(), entorno, m.f, AHORA)
    const body = String(llamadasA(m.f, 'api.openai.com')[0]![1]?.body)
    for (const prohibido of ['ID-INTERNO-POST', 'PERMALINK-SECRETO', 'ID-INTERNO-CAMP', 'CUENTA-INTERNA', 'sb_secret_xyz', 'crudo', MARCA.igId]) {
      expect(body).not.toContain(prohibido)
    }
    const { input } = JSON.parse(body) as { input: string }
    expect(input.length).toBeLessThan(12_000)
    expect(input).toContain('Suzuki Quilmes')
  })

  it('los mensajes viajan como conteos de la marca (sin ids de cuenta) con la aclaración de que no son de un post', async () => {
    const m = mundo({
      mensajes: [
        { cuenta_id: 'UUID-CUENTA-INTERNA', tipo: 'facebook', meta_id: MARCA.id, conversaciones_activas: '41', conversaciones_nuevas: '12', mensajes: '90', dias: 30 },
        { cuenta_id: 'UUID-OTRA', tipo: 'instagram', meta_id: MARCA.igId, conversaciones_activas: '7', conversaciones_nuevas: null, mensajes: null, dias: 30 },
      ],
    })
    await manejarAnalisis(pedido(), entorno, m.f, AHORA)
    const body = String(llamadasA(m.f, 'api.openai.com')[0]![1]?.body)
    expect(body).toContain('conversacionesActivas')
    expect(body).toContain('41')
    expect(body).toMatch(/no informa qué publicación/)
    expect(body).not.toContain('UUID-CUENTA-INTERNA')
    expect(body).not.toContain(MARCA.igId)
  })

  it('lee los mensajes con el rango de los filtros (RPC agregada, nunca filas)', async () => {
    const m = mundo()
    await manejarAnalisis(pedido(), entorno, m.f, AHORA)
    const llamada = m.f.mock.calls.find(([u]) => String(u).endsWith('/rpc/resumen_mensajes'))!
    expect(JSON.parse(String(llamada[1]?.body))).toMatchObject({ p_desde: '2026-09-21', p_hasta: '2026-10-20' })
  })

  it('la capa 2 nunca llama a Meta', async () => {
    const m = mundo()
    await manejarAnalisis(pedido(), entorno, m.f, AHORA)
    for (const [u] of m.f.mock.calls) {
      expect(new URL(String(u)).hostname).not.toMatch(/facebook\.com|facebook\.net|instagram\.com/)
    }
  })
})

describe('manejarAnalisis · errores de OpenAI', () => {
  it.each([
    [401, 502],
    [429, 502],
    [500, 502],
  ])('OpenAI %i responde %i en español, sin persistir y sin la clave', async (desde, esperado) => {
    const espia = vi.spyOn(console, 'error').mockImplementation(() => {})
    const espia2 = vi.spyOn(console, 'log').mockImplementation(() => {})
    const m = mundo({ openai: () => json({ error: { message: `Incorrect API key: ${KEY}` } }, desde) })
    const r = await manejarAnalisis(pedido(), entorno, m.f, AHORA)
    expect(r.status).toBe(esperado)
    const texto = await r.text()
    expect(texto).not.toContain(KEY)
    expect(JSON.parse(texto).error).toMatch(/OpenAI/)
    expect(m.insertados).toHaveLength(0)
    expect(JSON.stringify([...espia.mock.calls, ...espia2.mock.calls])).not.toContain(KEY)
  })

  it('timeout responde 504 y no persiste', async () => {
    vi.useFakeTimers()
    const m = mundo()
    const enrutado = m.f.getMockImplementation()!
    // OpenAI cuelga hasta que el cliente aborta a los 90 s; el resto del mundo responde normal.
    m.f.mockImplementation((u, init) =>
      new URL(String(u)).hostname === 'api.openai.com'
        ? new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('x', 'AbortError'))))
        : enrutado(u, init),
    )
    const p = manejarAnalisis(pedido(), entorno, m.f, AHORA)
    await vi.advanceTimersByTimeAsync(91_000)
    const r = await p
    vi.useRealTimers()
    expect(r.status).toBe(504)
    expect(m.insertados).toHaveLength(0)
  })

  it('respuesta incompleta responde 502 y no persiste', async () => {
    const m = mundo({ openai: () => json({ ...respuestaOpenAI(), status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }) })
    const r = await manejarAnalisis(pedido(), entorno, m.f, AHORA)
    expect(r.status).toBe(502)
    expect(m.insertados).toHaveLength(0)
  })

  it('si Supabase falla leyendo, responde 500 genérico sin filtrar detalles ni la clave', async () => {
    const espia = vi.spyOn(console, 'error').mockImplementation(() => {})
    const f = vi.fn<typeof fetch>(async () => json({ message: 'boom' }, 500))
    const r = await manejarAnalisis(pedido(), entorno, f, AHORA)
    expect(r.status).toBe(500)
    expect(await r.text()).not.toContain(KEY)
    expect(JSON.stringify(espia.mock.calls)).not.toContain(KEY)
  })
})
