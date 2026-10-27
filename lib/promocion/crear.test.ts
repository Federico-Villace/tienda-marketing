import { describe, it, expect, vi, afterEach } from 'vitest'
import { manejarCreacion } from './crear'
import { HEADER_USUARIO } from '../auth/acceso'
import { MARCAS } from '../datos/marcas'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { filaPromocion, ID_FOTO } from './fixture'

const entorno = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_xyz' }
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })

const cuerpo = (o: Record<string, unknown> = {}) => ({
  marcaId: MARCAS[3]!.id,
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
  new Request('https://app.ejemplo.com/api/promociones', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(usuario ? { [HEADER_USUARIO]: usuario } : {}) },
    body: typeof c === 'string' ? c : JSON.stringify(c),
  })

type Mundo = { rol?: string | null; foto?: 'ok' | 'inexistente' | 'borrada' }
function mundo(o: Mundo = {}) {
  const inserciones: any[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    if (url.hostname !== 'abc.supabase.co') throw new Error(`no se llama a ${url.hostname}`)
    if (url.pathname === '/rest/v1/miembros') return json(o.rol === null ? [] : [{ rol: o.rol ?? 'director' }])
    if (url.pathname === '/rest/v1/fotos') {
      // Una foto de inspiración no sirve como foto de la moto: se busca con uso=moto.
      if (o.foto === 'inexistente' || url.searchParams.get('uso') !== 'eq.moto') return json([])
      return json([{ id: ID_FOTO, ruta: o.foto === 'borrada' ? null : 'org/f.jpg', borrada_en: o.foto === 'borrada' ? '2026-10-20T00:00:00Z' : null }])
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

describe('acceso', () => {
  it('sin sesión 401 y lector 403, sin tocar la tabla', async () => {
    const m = mundo()
    expect((await manejarCreacion(pedido(cuerpo(), null), entorno, m.f)).status).toBe(401)
    const m2 = mundo({ rol: 'lector' })
    expect((await manejarCreacion(pedido(cuerpo()), entorno, m2.f)).status).toBe(403)
    expect(m2.inserciones).toHaveLength(0)
  })
  it('el operador también actúa', async () => {
    const m = mundo({ rol: 'operador' })
    expect((await manejarCreacion(pedido(cuerpo()), entorno, m.f)).status).toBe(201)
  })
})

describe('validación (400)', () => {
  it('un body roto o que no es un objeto', async () => {
    const m = mundo()
    expect((await manejarCreacion(pedido('no json'), entorno, m.f)).status).toBe(400)
    expect((await manejarCreacion(pedido([]), entorno, m.f)).status).toBe(400)
  })
  it('un pedido inválido devuelve la lista de errores y no inserta', async () => {
    const m = mundo()
    const r = await manejarCreacion(pedido(cuerpo({ modelo: 'x', aspecto: '1:2' })), entorno, m.f)
    expect(r.status).toBe(400)
    const b = (await r.json()) as { error: string; errores: string[] }
    expect(b.errores.length).toBeGreaterThanOrEqual(2)
    expect(m.inserciones).toHaveLength(0)
  })
  it('el monto como texto "4.500.000" es 400', async () => {
    const m = mundo()
    const r = await manejarCreacion(pedido(cuerpo({ precio: { moneda: 'ARS', monto: '4.500.000' } })), entorno, m.f)
    expect(r.status).toBe(400)
  })
})

describe('la foto', () => {
  it('inexistente es 404', async () => {
    const m = mundo({ foto: 'inexistente' })
    const r = await manejarCreacion(pedido(cuerpo()), entorno, m.f)
    expect(r.status).toBe(404)
    expect(((await r.json()) as any).error).toBe('No se encontró la foto.')
  })
  it('borrada es 410', async () => {
    const m = mundo({ foto: 'borrada' })
    const r = await manejarCreacion(pedido(cuerpo()), entorno, m.f)
    expect(r.status).toBe(410)
    expect(((await r.json()) as any).error).toBe('La foto se borró: subí otra.')
    expect(m.inserciones).toHaveLength(0)
  })
})

describe('creación', () => {
  it('201 con la promoción en borrador, revisión 1 y paso 2', async () => {
    const m = mundo()
    const r = await manejarCreacion(pedido(cuerpo()), entorno, m.f)
    expect(r.status).toBe(201)
    const { promocion } = (await r.json()) as any
    expect(promocion).toMatchObject({ id: 'p-nueva', estado: 'borrador', revision: 1, pasoActual: 2 })
  })
  it('inserta con la organización, el usuario y el lugar por defecto', async () => {
    const m = mundo()
    await manejarCreacion(pedido(cuerpo()), entorno, m.f)
    expect(m.inserciones[0]).toMatchObject({
      organizacion_id: ORGANIZACION_PILOTO_ID,
      marca_id: MARCAS[3]!.id,
      modelo: 'TRK 502',
      foto_id: ID_FOTO,
      aspecto: '4:5',
      creado_por: 'u-1',
      actualizado_por: 'u-1',
      datos: { lugar: 'Quilmes' },
    })
  })
  it('el precio del body no se reescribe ni se redondea', async () => {
    const m = mundo()
    await manejarCreacion(pedido(cuerpo({ precio: { moneda: 'USD', monto: 5990 } })), entorno, m.f)
    expect(m.inserciones[0].datos.precio).toEqual({ moneda: 'USD', monto: 5990 })
  })
  it('un error inesperado de la base es 500 sin filtrar detalles', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const f = vi.fn<typeof fetch>(async (u) => {
      const url = new URL(String(u))
      if (url.pathname === '/rest/v1/miembros') return json([{ rol: 'director' }])
      if (url.pathname === '/rest/v1/fotos') return json([{ id: ID_FOTO, ruta: 'x', borrada_en: null }])
      return json({ message: 'boom interno' }, 500)
    })
    const r = await manejarCreacion(pedido(cuerpo()), entorno, f)
    expect(r.status).toBe(500)
    expect(await r.text()).not.toContain('boom')
  })
})
