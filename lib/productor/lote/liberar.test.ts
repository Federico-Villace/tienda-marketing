import { describe, it, expect, vi, afterEach } from 'vitest'
import { manejarLiberacionLote } from './liberar'
import { entorno, ID_LOTE, mundo, request, type Mundo } from './mundo-fixture'
import { ORGANIZACION_PILOTO_ID } from '../../organizacion'

afterEach(() => vi.restoreAllMocks())

const liberarOk = () => Response.json(2)
const m0 = (o: Mundo = {}) => mundo({ lote: [{ id: ID_LOTE }], rpc: { liberar_generaciones_lote: liberarOk }, ...o })
const llamar = (m: ReturnType<typeof mundo>, id = ID_LOTE, e: Record<string, string | undefined> = entorno, usuario: string | null = 'u-1') =>
  manejarLiberacionLote(request(`/api/generaciones/lote/${id}/liberar`, {}, usuario), id, e, m.f)

describe('liberar lo confirmado que no se generó', () => {
  it('sin sesión 401 y lector 403, sin tocar nada', async () => {
    const a = m0()
    expect((await llamar(a, ID_LOTE, entorno, null)).status).toBe(401)
    const b = m0({ rol: 'lector' })
    expect((await llamar(b)).status).toBe(403)
    for (const m of [a, b]) {
      expect(m.rpcs).toHaveLength(0)
      expect(m.gemini).toHaveLength(0)
    }
  })
  it('id inválido o lote inexistente: 404', async () => {
    expect((await llamar(m0(), 'abc')).status).toBe(404)
    const m = m0({ lote: [] })
    expect((await llamar(m)).status).toBe(404)
    expect(m.rpcs).toHaveLength(0)
  })
  it('lo busca SOLO en la organización', async () => {
    const m = m0()
    await llamar(m)
    const u = new URL(String(m.f.mock.calls.find(([x]) => new URL(String(x)).pathname === '/rest/v1/lotes_generacion')![0]))
    expect(u.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
  })
  it('libera con la RPC y dice cuántas imágenes dejaron de contar en el tope', async () => {
    const m = m0()
    const r = await llamar(m)
    expect(r.status).toBe(200)
    expect(((await r.json()) as any)).toEqual({ liberadas: 2 })
    expect(m.rpcs).toEqual([{ nombre: 'liberar_generaciones_lote', args: { p_lote: ID_LOTE, p_usuario: 'u-1' } }])
    expect(m.gemini).toHaveLength(0)
  })
  it('funciona aunque el Productor esté apagado: liberar no gasta', async () => {
    expect((await llamar(m0(), ID_LOTE, { ...entorno, GEMINI_API_KEY: '' })).status).toBe(200)
  })
  it('PT404 de la RPC: 404; un error inesperado: 500 sin filtrar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await llamar(m0({ rpc: { liberar_generaciones_lote: () => new Response('{"message":"x"}', { status: 404 }) } }))).status).toBe(404)
    const r = await llamar(m0({ rpc: { liberar_generaciones_lote: () => new Response('{"message":"boom interno"}', { status: 500 }) } }))
    expect(r.status).toBe(500)
    expect(await r.text()).not.toContain('boom')
  })
})
