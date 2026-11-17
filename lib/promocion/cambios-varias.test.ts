import { describe, it, expect, vi, afterEach } from 'vitest'
import { manejarCambio } from './cambios'
import { HEADER_USUARIO } from '../auth/acceso'
import { copyDePrueba, filaPromocion, ID_PROMO } from './fixture'

const entorno = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_xyz' }
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const ID_INSP = '77777777-7777-4777-8777-777777777777'
const ID_F2 = '22222222-2222-4222-8222-222222222222'
const EXTRA = { fotoId: ID_F2, modelo: 'Rouser 200', precio: { moneda: 'ARS' as const, monto: 4_200_000 }, promo: { tipo: 'ninguna' as const, detalle: '' } }

function mundo(fila: Partial<ReturnType<typeof filaPromocion>>, rol = 'director') {
  const rpcs: { nombre: string; args: any }[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    if (url.hostname !== 'abc.supabase.co') throw new Error(`no se llama a ${url.hostname}`)
    if (url.pathname === '/rest/v1/miembros') return json([{ rol }])
    if (url.pathname === '/rest/v1/promociones') return json([filaPromocion({ id: ID_PROMO, ...fila })])
    if (url.pathname === '/rest/v1/fotos') return json([{ id: ID_INSP, ruta: 'r', borrada_en: null }])
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const args = JSON.parse(String(init?.body))
      rpcs.push({ nombre: url.pathname.split('/').pop()!, args })
      return json(filaPromocion({ id: ID_PROMO, revision: args.p_revision + 1, ...fila }))
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, rpcs }
}
afterEach(() => vi.restoreAllMocks())
const llamar = (c: unknown, m: ReturnType<typeof mundo>) =>
  manejarCambio(new Request(`https://app.ejemplo.com/api/promociones/${ID_PROMO}`, { method: 'PATCH', headers: { 'content-type': 'application/json', [HEADER_USUARIO]: 'u-1' }, body: JSON.stringify(c) }), ID_PROMO, entorno, m.f)

const varias = { motos_extra: [EXTRA] }

describe('varias motos · las motos no se cambian después de crear (ADR-041)', () => {
  it.each([
    ['el modelo', { modelo: 'Otra' }],
    ['la foto', { fotoId: '33333333-3333-4333-8333-333333333333' }],
    ['los datos (precio y promo)', { datos: { precio: { moneda: 'ARS', monto: 1 }, promo: { tipo: 'ninguna', detalle: '' }, lugar: 'Quilmes', indicaciones: '' } }],
  ])('%s: 422 y sin RPC', async (_n, cambio) => {
    const m = mundo(varias)
    const r = await llamar({ revision: 1, ...cambio }, m)
    expect(r.status).toBe(422)
    expect(((await r.json()) as any).error).toMatch(/varias motos/)
    expect(m.rpcs).toHaveLength(0)
  })
  it('lo demás sí se puede cambiar (el formato, el titular…)', async () => {
    const m = mundo(varias)
    expect((await llamar({ revision: 1, aspecto: '1:1' }, m)).status).toBe(200)
  })
  it('una promoción de una sola moto cambia su modelo como siempre', async () => {
    const m = mundo({})
    expect((await llamar({ revision: 1, modelo: 'Otra moto' }, m)).status).toBe(200)
  })
})

describe('varias motos · qué diseños admite', () => {
  it('las plantillas de una sola moto (clásicas, de diseño, referencia) se rechazan', async () => {
    for (const plantilla of ['oferta_abajo', 'catalogo', 'impactante_textura', 'deportiva', 'editorial', 'referencia']) {
      const m = mundo(varias)
      const r = await llamar({ revision: 1, plantilla }, m)
      expect(r.status, plantilla).toBe(422)
      expect(m.rpcs).toHaveLength(0)
    }
  })
  it('la copia fiel sí (con su referencia) y la grilla también', async () => {
    const m = mundo({ ...varias, inspiracion_foto_id: ID_INSP })
    expect((await llamar({ revision: 1, plantilla: 'copia_fiel' }, m)).status).toBe(200)
    const m2 = mundo(varias)
    expect((await llamar({ revision: 1, plantilla: 'varias_motos' }, m2)).status).toBe(200)
    expect(m2.rpcs[0]!.args.p_campos).toMatchObject({ plantilla: 'varias_motos' })
  })
  it('sin plantilla (null) también se puede volver', async () => {
    const m = mundo({ ...varias, plantilla: 'varias_motos' })
    expect((await llamar({ revision: 1, plantilla: null }, m)).status).toBe(200)
  })
  it('la grilla es solo de varias motos: en una promoción de una moto, 422', async () => {
    const m = mundo({})
    const r = await llamar({ revision: 1, plantilla: 'varias_motos' }, m)
    expect(r.status).toBe(422)
    expect(m.rpcs).toHaveLength(0)
  })
  it('el lector no cambia nada', async () => {
    const m = mundo(varias, 'lector')
    expect((await llamar({ revision: 1, plantilla: 'varias_motos' }, m)).status).toBe(403)
    expect(m.rpcs).toHaveLength(0)
  })
  it('ya con la grilla elegida, cambiar el titular sigue siendo posible', async () => {
    const m = mundo({ ...varias, plantilla: 'varias_motos', copy: copyDePrueba() })
    expect((await llamar({ revision: 1, titular: 'Todas en stock' }, m)).status).toBe(200)
  })
})
