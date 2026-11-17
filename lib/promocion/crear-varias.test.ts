import { describe, it, expect, vi, afterEach } from 'vitest'
import { manejarCreacion } from './crear'
import { HEADER_USUARIO } from '../auth/acceso'
import { MARCAS } from '../datos/marcas'
import { filaPromocion, ID_FOTO } from './fixture'

const entorno = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_xyz' }
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const F2 = '22222222-2222-4222-8222-222222222222'
const F3 = '33333333-3333-4333-8333-333333333333'

const extra = (o: Record<string, unknown> = {}) => ({ fotoId: F2, modelo: 'Rouser 200', precio: { moneda: 'ARS', monto: 4_200_000 }, promo: { tipo: 'ninguna', detalle: '' }, ...o })
const cuerpo = (o: Record<string, unknown> = {}) => ({
  marcaId: MARCAS[3]!.id,
  modelo: 'TRK 502',
  precio: { moneda: 'ARS', monto: 4_500_000 },
  promo: { tipo: 'cuotas', detalle: '12 cuotas sin interés' },
  lugar: '',
  indicaciones: '',
  fotoId: ID_FOTO,
  aspecto: '4:5',
  motos: [extra()],
  ...o,
})
const pedido = (c: unknown, usuario: string | null = 'u-1') =>
  new Request('https://app.ejemplo.com/api/promociones', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(usuario ? { [HEADER_USUARIO]: usuario } : {}) },
    body: JSON.stringify(c),
  })

type Mundo = { rol?: string | null; fotos?: Record<string, 'viva' | 'borrada' | 'inspiracion'> }
function mundo(o: Mundo = {}) {
  const fotos = o.fotos ?? { [ID_FOTO]: 'viva', [F2]: 'viva', [F3]: 'viva' }
  const inserciones: any[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    if (url.hostname !== 'abc.supabase.co') throw new Error(`no se llama a ${url.hostname}`)
    if (url.pathname === '/rest/v1/miembros') return json(o.rol === null ? [] : [{ rol: o.rol ?? 'director' }])
    if (url.pathname === '/rest/v1/fotos') {
      if (url.searchParams.get('uso') !== 'eq.moto') return json([])
      const filtro = url.searchParams.get('id') ?? ''
      const ids = filtro.startsWith('in.(') ? filtro.slice(4, -1).split(',') : [filtro.replace('eq.', '')]
      return json(
        ids
          .filter((id) => fotos[id] === 'viva' || fotos[id] === 'borrada')
          .map((id) => ({ id, ruta: fotos[id] === 'borrada' ? null : `org/${id}.jpg`, borrada_en: fotos[id] === 'borrada' ? '2026-10-20T00:00:00Z' : null })),
      )
    }
    if (url.pathname === '/rest/v1/promociones' && init?.method === 'POST') {
      const fila = JSON.parse(String(init.body))
      inserciones.push(fila)
      return json([filaPromocion({ ...fila, id: 'p-nueva', revision: 1, estado: 'borrador' })], 201)
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, inserciones }
}

afterEach(() => vi.restoreAllMocks())

describe('varias motos · acceso', () => {
  it('sin sesión 401 y lector 403, sin insertar', async () => {
    const m = mundo()
    expect((await manejarCreacion(pedido(cuerpo(), null), entorno, m.f)).status).toBe(401)
    const m2 = mundo({ rol: 'lector' })
    expect((await manejarCreacion(pedido(cuerpo()), entorno, m2.f)).status).toBe(403)
    expect(m2.inserciones).toHaveLength(0)
  })
})

describe('varias motos · validación (400)', () => {
  it('motos vacía o con 4 extras: no inserta', async () => {
    const m = mundo()
    expect((await manejarCreacion(pedido(cuerpo({ motos: [] })), entorno, m.f)).status).toBe(400)
    const cinco = [extra(), extra({ fotoId: F3 }), extra({ fotoId: 'a' }), extra({ fotoId: 'b' })]
    expect((await manejarCreacion(pedido(cuerpo({ motos: cinco })), entorno, m.f)).status).toBe(400)
    expect(m.inserciones).toHaveLength(0)
  })
  it('el error de una moto dice cuál es', async () => {
    const m = mundo()
    const r = await manejarCreacion(pedido(cuerpo({ motos: [extra({ precio: { moneda: 'ARS', monto: 1.5 } })] })), entorno, m.f)
    expect(r.status).toBe(400)
    expect(((await r.json()) as { errores: string[] }).errores.some((e) => e.startsWith('Moto 2: '))).toBe(true)
    expect(m.inserciones).toHaveLength(0)
  })
  it('la misma foto en dos motos es 400', async () => {
    const m = mundo()
    const r = await manejarCreacion(pedido(cuerpo({ motos: [extra({ fotoId: ID_FOTO })] })), entorno, m.f)
    expect(r.status).toBe(400)
    expect(m.inserciones).toHaveLength(0)
  })
  it('errores de la moto principal y de las extras juntos', async () => {
    const m = mundo()
    const r = await manejarCreacion(pedido(cuerpo({ modelo: 'x', motos: [extra({ modelo: 'y' })] })), entorno, m.f)
    expect(r.status).toBe(400)
    expect(((await r.json()) as { errores: string[] }).errores.length).toBeGreaterThanOrEqual(2)
  })
})

describe('varias motos · las fotos', () => {
  it('una foto extra que no existe (o es de inspiración) es 404 y no inserta', async () => {
    const m = mundo({ fotos: { [ID_FOTO]: 'viva', [F2]: 'inspiracion' } })
    const r = await manejarCreacion(pedido(cuerpo()), entorno, m.f)
    expect(r.status).toBe(404)
    expect(m.inserciones).toHaveLength(0)
  })
  it('una foto extra borrada es 410 y no inserta', async () => {
    const m = mundo({ fotos: { [ID_FOTO]: 'viva', [F2]: 'borrada' } })
    const r = await manejarCreacion(pedido(cuerpo()), entorno, m.f)
    expect(r.status).toBe(410)
    expect(m.inserciones).toHaveLength(0)
  })
  it('las fotos se buscan en la organización y como foto de moto', async () => {
    const m = mundo()
    await manejarCreacion(pedido(cuerpo()), entorno, m.f)
    const consulta = m.f.mock.calls.map(([u]) => new URL(String(u))).filter((u) => u.pathname === '/rest/v1/fotos' && (u.searchParams.get('id') ?? '').startsWith('in.('))
    expect(consulta).toHaveLength(1)
    expect(consulta[0]!.searchParams.get('uso')).toBe('eq.moto')
    expect(consulta[0]!.searchParams.get('organizacion_id')).toMatch(/^eq\./)
  })
})

describe('varias motos · creación', () => {
  it('201 e inserta motos_extra con las extras limpias, sin tocar las columnas de la moto principal', async () => {
    const m = mundo()
    const r = await manejarCreacion(pedido(cuerpo({ motos: [extra({ modelo: '  Rouser 200 ' }), extra({ fotoId: F3, modelo: 'Leoncino' })] })), entorno, m.f)
    expect(r.status).toBe(201)
    expect(m.inserciones[0]).toMatchObject({ modelo: 'TRK 502', foto_id: ID_FOTO, datos: { precio: { monto: 4_500_000 } } })
    expect(m.inserciones[0].motos_extra).toEqual([
      { fotoId: F2, modelo: 'Rouser 200', precio: { moneda: 'ARS', monto: 4_200_000 }, promo: { tipo: 'ninguna', detalle: '' } },
      { fotoId: F3, modelo: 'Leoncino', precio: { moneda: 'ARS', monto: 4_200_000 }, promo: { tipo: 'ninguna', detalle: '' } },
    ])
  })
  it('la respuesta trae las motos extra', async () => {
    const m = mundo()
    const r = await manejarCreacion(pedido(cuerpo()), entorno, m.f)
    const { promocion } = (await r.json()) as any
    expect(promocion.motosExtra).toHaveLength(1)
  })
  it('sin `motos` no se manda motos_extra (una promoción de una moto sola queda como siempre)', async () => {
    const m = mundo()
    const { motos: _m, ...sin } = cuerpo()
    await manejarCreacion(pedido(sin), entorno, m.f)
    expect('motos_extra' in m.inserciones[0]).toBe(false)
  })
})
