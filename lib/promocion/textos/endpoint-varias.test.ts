import { describe, it, expect, vi, afterEach } from 'vitest'
import { manejarTextos } from './endpoint'
import { HEADER_USUARIO } from '../../auth/acceso'
import { MARCAS } from '../../datos/marcas'
import { ORGANIZACION_PILOTO_ID } from '../../organizacion'
import { filaPromocion, ID_PROMO } from '../fixture'

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


const EXTRA = [{ fotoId: '22222222-2222-4222-8222-222222222222', modelo: 'Leoncino 500', precio: { moneda: 'ARS' as const, monto: 7_654_321 }, promo: { tipo: 'ninguna' as const, detalle: '' } }]
const aOpenAI = (f: ReturnType<typeof mundo>['f']) => f.mock.calls.filter(([u]) => new URL(String(u)).hostname === 'api.openai.com')
const llamar = (m: ReturnType<typeof mundo>, cuerpo: unknown = { revision: 1 }) => manejarTextos(pedido(cuerpo), ID_PROMO, entorno, m.f)

afterEach(() => vi.restoreAllMocks())

describe('los textos de una placa de varias motos', () => {
  it('el modelo recibe todas las motos pero NO el precio de las otras', async () => {
    const m = mundo({ promo: { motos_extra: EXTRA } })
    expect((await llamar(m)).status).toBe(200)
    const cuerpo = String(aOpenAI(m.f)[0]![1]!.body)
    expect(cuerpo).toContain('Leoncino 500')
    expect(cuerpo).toContain('motos juntas')
    expect(cuerpo).not.toContain('7.654.321')
    expect(cuerpo).not.toContain('7654321')
  })
  it('una moto sola: el pedido es el de siempre (sin motos)', async () => {
    const m = mundo()
    await llamar(m)
    const cuerpo = String(aOpenAI(m.f)[0]![1]!.body)
    expect(cuerpo).not.toContain('motos juntas')
  })
  it('un titular que nombra el modelo de otra moto con su número es válido (su modelo respalda el 500)', async () => {
    const m = mundo({ promo: { motos_extra: EXTRA }, openai: () => json(respuestaOpenAI(salida({ titular: 'TRK 502 o Leoncino 500' }))) })
    const r = await llamar(m)
    expect(r.status).toBe(200)
  })
  it('el caché distingue la placa de varias motos de la de una sola', async () => {
    const una = mundo()
    const varias = mundo({ promo: { motos_extra: EXTRA } })
    await llamar(una)
    await llamar(varias)
    const hashDe = (x: ReturnType<typeof mundo>) => (x.insertados[0] as { hash_entrada: string }).hash_entrada
    expect(hashDe(una)).not.toBe(hashDe(varias))
  })
})
