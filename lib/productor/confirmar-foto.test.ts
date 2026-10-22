import { describe, it, expect, vi } from 'vitest'
import { HEADER_USUARIO } from '../auth/acceso'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { manejarConfirmacion } from './confirmar'

const GEN_ID = '44444444-4444-4444-8444-444444444444'
const FOTO_ID = '77777777-7777-4777-8777-777777777777'
const RUTA = `${ORGANIZACION_PILOTO_ID}/${FOTO_ID}.jpg`
const CLAVE = 'AIza-SECRETISIMA-1234'
const SECRETA = 'sb_secret_xyz'
const entorno = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SECRET_KEY: SECRETA,
  GEMINI_API_KEY: CLAVE,
  PRESUPUESTO_MENSUAL_USD: '10',
}

/** Los bytes "originales" de la foto. Lo que Gemini tiene que recibir tal cual. */
const ORIGINAL = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0x11, 0x22, 0x33, 0xff, 0xd9])
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x04, 0x80, 0x03, 0x80, 0x01, 0, 0, 0, 0xff, 0xd9])
const imagenOk = (usage: object = { total_input_tokens: 1200, total_output_tokens: 1120, output_tokens_by_modality: [{ modality: 'image', tokens: 1120 }] }) =>
  Response.json({
    status: 'completed',
    steps: [{ type: 'model_output', content: [{ type: 'image', data: Buffer.from(JPEG).toString('base64'), mime_type: 'image/jpeg' }] }],
    usage,
  })

// 0,0336 + (1500+1120)*1,5/1e6 + 1000*7,5/1e6 = 0,04503 por imagen
const generacionFoto = (o: Record<string, unknown> = {}) => ({
  id: GEN_ID,
  estado: 'estimada',
  motor: 'gemini-nano-banana-2.1',
  cantidad: 2,
  aspecto: '4:5',
  prompt: 'Editá esta foto real de una moto',
  pieza_id: null,
  pieza_raiz_id: null,
  foto_id: FOTO_ID,
  costo_estimado_usd: 0.09006,
  ...o,
})
const generacionPieza = (o: Record<string, unknown> = {}) =>
  generacionFoto({ pieza_id: 'p-1', pieza_raiz_id: 'r-1', foto_id: null, costo_estimado_usd: 0.0867, ...o })

type Mundo = {
  gen?: Record<string, unknown>
  foto?: Record<string, unknown> | null
  descarga?: number
  confirmar?: () => Response
  gemini?: (n: number) => Response
}
function mundo(o: Mundo = {}) {
  const log: string[] = []
  const gemini: { body: any; headers: Record<string, string> }[] = []
  const creativos: any[] = []
  const descargas: string[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    const metodo = init?.method ?? 'GET'
    if (url.hostname === 'generativelanguage.googleapis.com') {
      const n = gemini.length
      gemini.push({ body: JSON.parse(String(init!.body)), headers: init!.headers as Record<string, string> })
      log.push('gemini')
      return (o.gemini ?? (() => imagenOk()))(n)
    }
    if (url.pathname === '/rest/v1/miembros') return Response.json([{ rol: 'director' }])
    if (url.pathname === '/rest/v1/generaciones' && metodo === 'GET') return Response.json([o.gen ?? generacionFoto()])
    if (url.pathname === '/rest/v1/generaciones' && metodo === 'PATCH') {
      log.push(`estado:${JSON.parse(String(init!.body)).estado}`)
      return new Response(null, { status: 204 })
    }
    if (url.pathname === '/rest/v1/fotos') {
      log.push('foto:leer')
      expect(url.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
      return Response.json(o.foto === null ? [] : [o.foto ?? { ruta: RUTA, borrada_en: null }])
    }
    if (url.pathname.startsWith('/storage/v1/object/authenticated/fotos/')) {
      log.push('foto:descargar')
      descargas.push(url.pathname)
      return o.descarga ? new Response('{"message":"x"}', { status: o.descarga }) : new Response(ORIGINAL, { status: 200 })
    }
    if (url.pathname === '/rest/v1/rpc/confirmar_generacion') {
      log.push('rpc:confirmar')
      return (o.confirmar ?? (() => Response.json({})))()
    }
    if (url.pathname === '/rest/v1/rpc/gasto_generaciones_mes') return Response.json(0)
    if (url.pathname.startsWith('/storage/v1/object/sign/creativos')) {
      const { paths } = JSON.parse(String(init!.body))
      return Response.json(paths.map((p: string) => ({ path: p, signedURL: `/object/sign/creativos/${p}?token=T`, error: null })))
    }
    if (url.pathname.startsWith('/storage/v1/object/creativos/')) return new Response('{}', { status: 200 })
    if (url.pathname === '/rest/v1/creativos' && metodo === 'POST') {
      const cuerpo = JSON.parse(String(init!.body))
      creativos.push(cuerpo)
      return Response.json([{ id: `c-${cuerpo.orden}`, ...cuerpo }])
    }
    throw new Error(`URL inesperada: ${metodo} ${url}`)
  })
  return { f, log, gemini, creativos, descargas }
}
const pedido = () =>
  new Request(`https://app.ejemplo.com/api/generaciones/${GEN_ID}/confirmar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [HEADER_USUARIO]: 'u-1' },
    body: '{}',
  })
const confirmar = (m: ReturnType<typeof mundo>) => manejarConfirmacion(pedido(), GEN_ID, entorno, m.f)
const rpcFalla = (status: number) => () => new Response('{"message":"x"}', { status })

describe('confirmar una edición de foto (F9)', () => {
  it('S9.1 una foto inexistente es 404 y una borrada es 410, SIN RPC ni Gemini', async () => {
    const a = mundo({ foto: null })
    expect((await confirmar(a)).status).toBe(404)
    for (const foto of [{ ruta: null, borrada_en: '2026-10-26T10:00:00Z' }, { ruta: RUTA, borrada_en: '2026-10-26T10:00:00Z' }]) {
      const b = mundo({ foto })
      expect((await confirmar(b)).status).toBe(410)
      expect(b.log).not.toContain('rpc:confirmar')
      expect(b.gemini).toHaveLength(0)
      expect(b.descargas).toHaveLength(0)
    }
    expect(a.log).not.toContain('rpc:confirmar')
    expect(a.gemini).toHaveLength(0)
  })

  it('S9.2 descarga los bytes UNA vez y ANTES de la RPC', async () => {
    const m = mundo()
    const r = await confirmar(m)
    expect(r.status).toBe(200)
    expect(m.descargas).toEqual([`/storage/v1/object/authenticated/fotos/${RUTA}`])
    expect(m.log.indexOf('foto:descargar')).toBeGreaterThan(-1)
    expect(m.log.indexOf('foto:descargar')).toBeLessThan(m.log.indexOf('rpc:confirmar'))
    expect(m.log.indexOf('rpc:confirmar')).toBeLessThan(m.log.indexOf('gemini'))
  })

  it('S9.2 si Storage falla: 500, sin RPC (no se cobra) y sin Gemini', async () => {
    const m = mundo({ descarga: 500 })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await confirmar(m)
    expect(r.status).toBe(500)
    expect(m.log).not.toContain('rpc:confirmar')
    expect(m.gemini).toHaveLength(0)
    expect(JSON.stringify(await r.json()) + JSON.stringify(spy.mock.calls)).not.toContain(SECRETA)
    spy.mockRestore()
  })

  it('S9.3 recalcula el precio conFoto: si no coincide con lo estimado, 409 sin RPC ni Gemini', async () => {
    // 0,0867 es el tope SIN foto: alguien estimó mal o cambiaron los precios
    const m = mundo({ gen: generacionFoto({ costo_estimado_usd: 0.0867 }) })
    const r = await confirmar(m)
    expect(r.status).toBe(409)
    expect(m.log).not.toContain('rpc:confirmar')
    expect(m.gemini).toHaveLength(0)
  })

  it.each([
    ['402', rpcFalla(402)],
    ['409', rpcFalla(409)],
    ['410', rpcFalla(410)],
  ])('S9.4 la RPC rechaza con %s: cero requests a Gemini', async (_n, confirmarRpc) => {
    const m = mundo({ confirmar: confirmarRpc })
    const r = await confirmar(m)
    expect([402, 409, 410]).toContain(r.status)
    expect(m.gemini).toHaveLength(0)
    expect(m.creativos).toHaveLength(0)
  })

  it('S9.5 cada pedido a Gemini lleva la foto original como imagen de entrada', async () => {
    const m = mundo()
    await confirmar(m)
    expect(m.gemini).toHaveLength(2)
    for (const g of m.gemini) {
      expect(g.body.input).toEqual([
        { type: 'text', text: 'Editá esta foto real de una moto' },
        { type: 'image', mime_type: 'image/jpeg', data: Buffer.from(ORIGINAL).toString('base64') },
      ])
      expect(g.body.store).toBe(false)
      expect(g.headers['x-goog-api-key']).toBe(CLAVE)
    }
  })

  it('S9.6 los creativos se insertan con foto_id y sin pieza_id ni pieza_raiz_id', async () => {
    const m = mundo()
    await confirmar(m)
    expect(m.creativos).toHaveLength(2)
    for (const c of m.creativos) {
      expect(c.foto_id).toBe(FOTO_ID)
      expect(c.pieza_id ?? null).toBeNull()
      expect(c.pieza_raiz_id ?? null).toBeNull()
      expect(c.generacion_id).toBe(GEN_ID)
      expect(c.ruta).toMatch(new RegExp(`^${ORGANIZACION_PILOTO_ID}/${GEN_ID}/[12]\\.jpg$`))
    }
  })

  it('S9.7 el costo real es la suma de lo que dice usage (incluye la imagen de entrada)', async () => {
    const m = mundo()
    const r = await confirmar(m)
    const c = await r.json()
    // (1200*1,5 + 1120*30)/1e6 = 0,0354 por imagen
    expect(c.generacion.costoRealUsd).toBe(0.0708)
    expect(c.generacion.costoEstimadoUsd).toBe(0.09006)
    expect(m.creativos.map((x) => x.tokens_entrada)).toEqual([1200, 1200])
  })

  it('nunca imprime ni devuelve la foto en base64 ni la ruta cruda', async () => {
    const m = mundo()
    const r = await confirmar(m)
    const texto = JSON.stringify(await r.json())
    expect(texto).not.toContain(Buffer.from(ORIGINAL).toString('base64'))
    expect(texto).not.toContain(RUTA)
  })

  it('un timeout de Gemini se presupuesta con el tope CON foto', async () => {
    const m = mundo({ gemini: () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }) } })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await confirmar(m)
    expect(m.creativos.map((x) => x.costo_usd)).toEqual([0.04503, 0.04503])
    spy.mockRestore()
  })

  it('S9.8 el camino de pieza no cambia: no lee fotos, no descarga y el input es un string', async () => {
    const m = mundo({ gen: generacionPieza() })
    const r = await confirmar(m)
    expect(r.status).toBe(200)
    expect(m.log).not.toContain('foto:leer')
    expect(m.log).not.toContain('foto:descargar')
    expect(m.gemini[0]!.body.input).toBe('Editá esta foto real de una moto')
    expect(m.creativos[0]).toMatchObject({ pieza_id: 'p-1', pieza_raiz_id: 'r-1' })
    expect(m.creativos[0]!.foto_id ?? null).toBeNull()
  })
})
