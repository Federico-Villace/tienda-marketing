import { describe, it, expect, vi, afterEach } from 'vitest'
import { manejarCreacionTanda } from './crear'
import { HEADER_USUARIO } from '../../auth/acceso'
import { MARCAS } from '../../datos/marcas'
import { ORGANIZACION_PILOTO_ID } from '../../organizacion'
import { filaPromocion } from '../fixture'

const entorno = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_xyz' }
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const [, , M2, M3, , M5] = MARCAS.map((m) => m.id) as [string, string, string, string, string, string]
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const moto = (n: number, o: Record<string, unknown> = {}) => ({
  fotoId: uuid(n),
  modelo: `TRK ${500 + n}`,
  precio: { moneda: 'ARS', monto: 4_000_000 + n },
  promo: { tipo: 'contado', detalle: '' },
  ...o,
})
const cuerpoMotos = (o: Record<string, unknown> = {}) => ({
  tipo: 'motos',
  marcaIds: [M3],
  aspecto: '4:5',
  motos: [moto(1), moto(2), moto(3)],
  ...o,
})
const cuerpoTextos = (o: Record<string, unknown> = {}) => ({
  tipo: 'textos',
  marcaIds: [M3],
  fotoId: uuid(1),
  modelo: 'TRK 502',
  aspecto: '4:5',
  precio: { moneda: 'ARS', monto: 4_500_000 },
  promo: { tipo: 'cuotas', detalle: '12 cuotas sin interés' },
  variantes: [{ titular: 'Salí a la ruta' }, { titular: 'Hot Sale' }],
  ...o,
})
const pedido = (c: unknown, usuario: string | null = 'u-1') =>
  new Request('https://app.ejemplo.com/api/tandas', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(usuario ? { [HEADER_USUARIO]: usuario } : {}) },
    body: typeof c === 'string' ? c : JSON.stringify(c),
  })

type Mundo = { rol?: string | null; faltan?: string[]; borradas?: string[]; rpc?: { status: number; mensaje?: string } }
function mundo(o: Mundo = {}) {
  const rpcs: { nombre: string; args: any }[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    if (url.hostname !== 'abc.supabase.co') throw new Error(`no se llama a ${url.hostname}`)
    if (url.pathname === '/rest/v1/miembros') return json(o.rol === null ? [] : [{ rol: o.rol ?? 'director' }])
    if (url.pathname === '/rest/v1/fotos') {
      expect(url.searchParams.get('uso')).toBe('eq.moto')
      expect(url.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
      const ids = /^(?:in\.\((.*)\)|eq\.(.*))$/.exec(url.searchParams.get('id') ?? '')!.slice(1).find(Boolean)!.split(',')
      return json(
        ids
          .filter((id) => !(o.faltan ?? []).includes(id))
          .map((id) => ({ id, ruta: (o.borradas ?? []).includes(id) ? null : `org/${id}.jpg`, borrada_en: (o.borradas ?? []).includes(id) ? '2026-10-20T00:00:00Z' : null })),
      )
    }
    if (url.pathname === '/rest/v1/rpc/crear_lote_promocion') {
      const args = JSON.parse(String(init?.body))
      rpcs.push({ nombre: 'crear_lote_promocion', args })
      if (o.rpc && o.rpc.status >= 400) return json({ message: o.rpc.mensaje ?? 'x' }, o.rpc.status)
      return json({
        tandaId: 'tanda-9',
        promociones: (args.p_items as any[]).flatMap((it, i) =>
          (args.p_marcas as string[]).map((m, j) =>
            filaPromocion({ id: `p${i}-${j}`, marca_id: m, tanda_id: 'tanda-9', ...(args.p_tipo === 'motos' ? { grupo: i + 1 } : { variante: i + 1 }) }),
          ),
        ),
      })
    }
    if (url.pathname === '/rest/v1/rpc/crear_tanda_promocion') {
      rpcs.push({ nombre: 'crear_tanda_promocion', args: JSON.parse(String(init?.body)) })
      return json({ tandaId: 'tanda-1', promociones: [filaPromocion({ id: 'p0', tanda_id: 'tanda-1' })] })
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, rpcs }
}

afterEach(() => vi.restoreAllMocks())

describe('tipo de la tanda', () => {
  it('"marcas" explícito es lo de siempre; un tipo desconocido es 400 sin tocar nada', async () => {
    const m = mundo()
    const cuerpoViejo = { tipo: 'marcas', marcaIds: [M2, M3], modelo: 'TRK 502', precio: { moneda: 'ARS', monto: 1 }, promo: { tipo: 'ninguna' }, fotoId: uuid(1), aspecto: '4:5' }
    const r = await manejarCreacionTanda(pedido(cuerpoViejo), entorno, m.f)
    // El camino viejo usa crear_tanda_promocion, no la del lote, y no devuelve "tipo".
    expect(r.status).toBe(201)
    expect(m.rpcs.map((x) => x.nombre)).toEqual(['crear_tanda_promocion'])
    const mala = await manejarCreacionTanda(pedido({ ...cuerpoViejo, tipo: 'grilla' }), entorno, mundo().f)
    expect(mala.status).toBe(400)
  })
})

describe('acceso', () => {
  it('sin sesión 401 y lector 403, sin llamar a la RPC', async () => {
    expect((await manejarCreacionTanda(pedido(cuerpoMotos(), null), entorno, mundo().f)).status).toBe(401)
    const b = mundo({ rol: 'lector' })
    expect((await manejarCreacionTanda(pedido(cuerpoMotos()), entorno, b.f)).status).toBe(403)
    expect(b.rpcs).toHaveLength(0)
  })
  it('el operador también actúa', async () => {
    expect((await manejarCreacionTanda(pedido(cuerpoMotos()), entorno, mundo({ rol: 'operador' }).f)).status).toBe(201)
  })
})

describe('lote de motos (A)', () => {
  it('201: la tanda y una hija por moto × marca, con el tipo', async () => {
    const m = mundo()
    const r = await manejarCreacionTanda(pedido(cuerpoMotos({ marcaIds: [M5, M3] })), entorno, m.f)
    expect(r.status).toBe(201)
    const b = (await r.json()) as any
    expect(b.tanda).toEqual({ id: 'tanda-9', tipo: 'motos' })
    expect(b.promociones).toHaveLength(6)
    expect(b.promociones[0]).toMatchObject({ estado: 'borrador', tandaId: 'tanda-9', grupo: 1, variante: null })
  })

  it('llama a la RPC con el tipo, las marcas en orden, los ítems con SU precio y el lugar por defecto', async () => {
    const m = mundo()
    await manejarCreacionTanda(pedido(cuerpoMotos({ marcaIds: [M5, M3] })), entorno, m.f)
    const { nombre, args } = m.rpcs[0]!
    expect(nombre).toBe('crear_lote_promocion')
    expect(args).toMatchObject({ p_org: ORGANIZACION_PILOTO_ID, p_tipo: 'motos', p_marcas: [M3, M5], p_aspecto: '4:5', p_usuario: 'u-1' })
    expect(args.p_items).toHaveLength(3)
    expect(args.p_items[1]).toEqual({
      fotoId: uuid(2),
      modelo: 'TRK 502',
      datos: { precio: { moneda: 'ARS', monto: 4_000_002 }, promo: { tipo: 'contado', detalle: '' }, lugar: 'Quilmes', indicaciones: '' },
    })
  })

  it('verifica TODAS las fotos antes de la RPC: una inexistente es 404 y una borrada 410, sin crear nada', async () => {
    const a = mundo({ faltan: [uuid(2)] })
    expect((await manejarCreacionTanda(pedido(cuerpoMotos()), entorno, a.f)).status).toBe(404)
    const b = mundo({ borradas: [uuid(3)] })
    expect((await manejarCreacionTanda(pedido(cuerpoMotos()), entorno, b.f)).status).toBe(410)
    expect(a.rpcs.length + b.rpcs.length).toBe(0)
  })

  it('pide cada foto una sola vez aunque se repita', async () => {
    const m = mundo()
    await manejarCreacionTanda(pedido(cuerpoMotos({ motos: [moto(1), moto(2, { fotoId: uuid(1) })] })), entorno, m.f)
    const url = new URL(String(m.f.mock.calls.find(([u]) => new URL(String(u)).pathname === '/rest/v1/fotos')![0]))
    expect(url.searchParams.get('id')).toBe(`in.(${uuid(1)})`)
  })

  it('un pedido inválido es 400 con la lista de errores, sin tocar la RPC (11 motos, 16 placas, foto mala)', async () => {
    const m = mundo()
    const once = Array.from({ length: 11 }, (_, i) => moto(i + 1))
    for (const c of [cuerpoMotos({ motos: once }), cuerpoMotos({ marcaIds: [MARCAS[0]!.id, MARCAS[1]!.id, M2, M3], motos: [moto(1), moto(2), moto(3), moto(4)] }), cuerpoMotos({ motos: [moto(1), moto(2, { fotoId: 'no' })] })]) {
      const r = await manejarCreacionTanda(pedido(c), entorno, m.f)
      expect(r.status).toBe(400)
      expect(((await r.json()) as any).errores.length).toBeGreaterThan(0)
    }
    expect(m.rpcs).toHaveLength(0)
  })

  it('body roto: 400', async () => {
    expect((await manejarCreacionTanda(pedido('no json'), entorno, mundo().f)).status).toBe(400)
  })

  it('PT404 de la RPC (foto borrada en el medio) es 404; 22023 es 400; 23505 es 409; lo demás 500 sin filtrar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await manejarCreacionTanda(pedido(cuerpoMotos()), entorno, mundo({ rpc: { status: 404 } }).f)).status).toBe(404)
    expect((await manejarCreacionTanda(pedido(cuerpoMotos()), entorno, mundo({ rpc: { status: 400 } }).f)).status).toBe(400)
    expect((await manejarCreacionTanda(pedido(cuerpoMotos()), entorno, mundo({ rpc: { status: 409 } }).f)).status).toBe(409)
    const r = await manejarCreacionTanda(pedido(cuerpoMotos()), entorno, mundo({ rpc: { status: 500, mensaje: 'boom interno' } }).f)
    expect(r.status).toBe(500)
    expect(await r.text()).not.toContain('boom')
  })

  it('no llama a ningún modelo ni a Meta (no cuesta plata)', async () => {
    const m = mundo()
    await manejarCreacionTanda(pedido(cuerpoMotos()), entorno, m.f)
    for (const [u] of m.f.mock.calls) expect(new URL(String(u)).hostname).toBe('abc.supabase.co')
  })
})

describe('lote de textos (C)', () => {
  it('201: una hija por texto, con titular, línea extra y datos propios en los ítems', async () => {
    const m = mundo()
    const r = await manejarCreacionTanda(
      pedido(cuerpoTextos({ variantes: [{ titular: 'Salí a la ruta', lineaExtra: 'Hot Sale' }, { titular: 'Solo hoy', precio: { moneda: 'ARS', monto: 4_200_000 } }] })),
      entorno,
      m.f,
    )
    expect(r.status).toBe(201)
    expect(((await r.json()) as any).tanda).toEqual({ id: 'tanda-9', tipo: 'textos' })
    const { args } = m.rpcs[0]!
    expect(args).toMatchObject({ p_tipo: 'textos', p_marcas: [M3], p_aspecto: '4:5' })
    expect(args.p_items[0]).toMatchObject({ fotoId: uuid(1), modelo: 'TRK 502', titular: 'Salí a la ruta', lineaExtra: 'Hot Sale' })
    expect(args.p_items[1]!.datos.precio.monto).toBe(4_200_000)
    expect(args.p_items[1]!.lineaExtra).toBeNull()
  })

  it('una sola verificación de la foto; 404 y 410 igual que en motos', async () => {
    expect((await manejarCreacionTanda(pedido(cuerpoTextos()), entorno, mundo({ faltan: [uuid(1)] }).f)).status).toBe(404)
    expect((await manejarCreacionTanda(pedido(cuerpoTextos()), entorno, mundo({ borradas: [uuid(1)] }).f)).status).toBe(410)
  })

  it('variantes iguales: 400 sin tocar la RPC', async () => {
    const m = mundo()
    const r = await manejarCreacionTanda(pedido(cuerpoTextos({ variantes: [{ titular: 'Igual' }, { titular: 'Igual' }] })), entorno, m.f)
    expect(r.status).toBe(400)
    expect(JSON.stringify(await r.json())).toContain('Las variantes 1 y 2 son iguales')
    expect(m.rpcs).toHaveLength(0)
  })
})
