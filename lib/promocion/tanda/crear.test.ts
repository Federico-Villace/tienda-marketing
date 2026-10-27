import { describe, it, expect, vi, afterEach } from 'vitest'
import { manejarCreacionTanda } from './crear'
import { HEADER_USUARIO } from '../../auth/acceso'
import { MARCAS } from '../../datos/marcas'
import { ORGANIZACION_PILOTO_ID } from '../../organizacion'
import { filaPromocion, ID_FOTO } from '../fixture'

const entorno = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_xyz' }
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const [M0, M1, M2, M3, M4, M5, M6] = MARCAS.map((m) => m.id) as [string, string, string, string, string, string, string]

const cuerpo = (o: Record<string, unknown> = {}) => ({
  marcaIds: [M3, M5, M2],
  modelo: 'TRK 502',
  precio: { moneda: 'ARS', monto: 4_500_000 },
  promo: { tipo: 'cuotas', detalle: '12 cuotas sin interés' },
  lugar: '',
  indicaciones: '',
  fotoId: ID_FOTO,
  aspecto: '4:5',
  ...o,
})
const pedido = (c: unknown, usuario: string | null = 'u-1') =>
  new Request('https://app.ejemplo.com/api/tandas', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(usuario ? { [HEADER_USUARIO]: usuario } : {}) },
    body: typeof c === 'string' ? c : JSON.stringify(c),
  })

type Mundo = { rol?: string | null; foto?: 'ok' | 'inexistente' | 'borrada'; rpc?: { status: number; mensaje?: string } }
function mundo(o: Mundo = {}) {
  const rpcs: any[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    if (url.hostname !== 'abc.supabase.co') throw new Error(`no se llama a ${url.hostname}`)
    if (url.pathname === '/rest/v1/miembros') return json(o.rol === null ? [] : [{ rol: o.rol ?? 'director' }])
    if (url.pathname === '/rest/v1/fotos') {
      // Una foto de inspiración no sirve como foto de la moto: se busca con uso=moto.
      if (o.foto === 'inexistente' || url.searchParams.get('uso') !== 'eq.moto') return json([])
      return json([{ id: ID_FOTO, ruta: o.foto === 'borrada' ? null : 'org/f.jpg', borrada_en: o.foto === 'borrada' ? '2026-10-20T00:00:00Z' : null }])
    }
    if (url.pathname === '/rest/v1/rpc/crear_tanda_promocion') {
      const args = JSON.parse(String(init?.body))
      rpcs.push(args)
      if (o.rpc && o.rpc.status >= 400) return json({ message: o.rpc.mensaje ?? 'x' }, o.rpc.status)
      return json({
        tandaId: 'tanda-1',
        promociones: (args.p_marcas as string[]).map((m, i) => filaPromocion({ id: `p${i}`, marca_id: m, tanda_id: 'tanda-1' })),
      })
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, rpcs }
}

afterEach(() => vi.restoreAllMocks())

describe('acceso', () => {
  it('sin sesión 401 y lector 403, sin llamar a la RPC', async () => {
    const a = mundo()
    expect((await manejarCreacionTanda(pedido(cuerpo(), null), entorno, a.f)).status).toBe(401)
    const b = mundo({ rol: 'lector' })
    expect((await manejarCreacionTanda(pedido(cuerpo()), entorno, b.f)).status).toBe(403)
    expect(b.rpcs).toHaveLength(0)
  })
  it('el operador también actúa', async () => {
    expect((await manejarCreacionTanda(pedido(cuerpo()), entorno, mundo({ rol: 'operador' }).f)).status).toBe(201)
  })
})

describe('validación (400)', () => {
  it('body roto o que no es un objeto', async () => {
    const m = mundo()
    expect((await manejarCreacionTanda(pedido('no json'), entorno, m.f)).status).toBe(400)
    expect((await manejarCreacionTanda(pedido([]), entorno, m.f)).status).toBe(400)
  })
  it('una sola marca, ocho, repetidas, desconocidas o sin lista: 400 sin tocar la RPC', async () => {
    const m = mundo()
    for (const marcaIds of [[M0], [M0, M0], [M0, 'nope'], 'todas', undefined, [M0, M1, M2, M3, M4, M5, M6, M0]]) {
      const r = await manejarCreacionTanda(pedido(cuerpo({ marcaIds })), entorno, m.f)
      expect(r.status).toBe(400)
      expect(((await r.json()) as any).errores.join(' ')).toMatch(/marcas/i)
    }
    expect(m.rpcs).toHaveLength(0)
  })
  it('un dato inválido del resto del pedido devuelve la lista de errores', async () => {
    const m = mundo()
    const r = await manejarCreacionTanda(pedido(cuerpo({ modelo: 'x', aspecto: '1:2' })), entorno, m.f)
    expect(r.status).toBe(400)
    expect(((await r.json()) as any).errores.length).toBeGreaterThanOrEqual(2)
    expect(m.rpcs).toHaveLength(0)
  })
  it('"marcaId" suelto no se acepta en una tanda', async () => {
    const m = mundo()
    expect((await manejarCreacionTanda(pedido(cuerpo({ marcaId: M0 })), entorno, m.f)).status).toBe(400)
  })
})

describe('la foto', () => {
  it('inexistente 404 y borrada 410, sin crear nada', async () => {
    const a = mundo({ foto: 'inexistente' })
    expect((await manejarCreacionTanda(pedido(cuerpo()), entorno, a.f)).status).toBe(404)
    const b = mundo({ foto: 'borrada' })
    expect((await manejarCreacionTanda(pedido(cuerpo()), entorno, b.f)).status).toBe(410)
    expect(a.rpcs.length + b.rpcs.length).toBe(0)
  })
  it('si se borra entre la lectura y la RPC, la RPC dice PT404 y es 404', async () => {
    const m = mundo({ rpc: { status: 404, mensaje: 'La foto no existe o se borró' } })
    expect((await manejarCreacionTanda(pedido(cuerpo()), entorno, m.f)).status).toBe(404)
  })
})

describe('creación', () => {
  it('201 con la tanda y N promociones en borrador', async () => {
    const m = mundo()
    const r = await manejarCreacionTanda(pedido(cuerpo()), entorno, m.f)
    expect(r.status).toBe(201)
    const b = (await r.json()) as any
    expect(b.tanda).toEqual({ id: 'tanda-1' })
    expect(b.promociones).toHaveLength(3)
    expect(b.promociones[0]).toMatchObject({ estado: 'borrador', tandaId: 'tanda-1', pasoActual: 2 })
  })
  it('llama a la RPC con las marcas en ORDEN DE MARCAS, el usuario, la organización y el lugar por defecto', async () => {
    const m = mundo()
    await manejarCreacionTanda(pedido(cuerpo()), entorno, m.f)
    expect(m.rpcs[0]).toMatchObject({
      p_org: ORGANIZACION_PILOTO_ID,
      p_marcas: [M2, M3, M5],
      p_modelo: 'TRK 502',
      p_foto: ID_FOTO,
      p_aspecto: '4:5',
      p_usuario: 'u-1',
      p_datos: { lugar: 'Quilmes', precio: { moneda: 'ARS', monto: 4_500_000 } },
    })
  })
  it('una marca ya en la tanda (índice único) es 409', async () => {
    const m = mundo({ rpc: { status: 409, mensaje: 'duplicate key' } })
    const r = await manejarCreacionTanda(pedido(cuerpo()), entorno, m.f)
    expect(r.status).toBe(409)
    expect(await r.text()).not.toContain('duplicate')
  })
  it('22023 de la RPC (cardinalidad) es 400', async () => {
    const m = mundo({ rpc: { status: 400, mensaje: 'Elegí entre 2 y 7' } })
    expect((await manejarCreacionTanda(pedido(cuerpo()), entorno, m.f)).status).toBe(400)
  })
  it('un error inesperado es 500 sin filtrar detalles', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = mundo({ rpc: { status: 500, mensaje: 'boom interno' } })
    const r = await manejarCreacionTanda(pedido(cuerpo()), entorno, m.f)
    expect(r.status).toBe(500)
    expect(await r.text()).not.toContain('boom')
  })
  it('no llama a ningún modelo ni a Meta (no cuesta plata)', async () => {
    const m = mundo()
    await manejarCreacionTanda(pedido(cuerpo()), entorno, m.f)
    for (const [u] of m.f.mock.calls) expect(new URL(String(u)).hostname).toBe('abc.supabase.co')
  })
})
