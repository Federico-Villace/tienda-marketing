import { describe, it, expect, vi, afterEach } from 'vitest'
import { manejarConfirmacionLote } from './confirmar'
import { entorno, foto, ID_LOTE, ID_REF, mundo, request, type Mundo } from './mundo-fixture'
import { estimarImagenes } from '../precios'
import { ORGANIZACION_PILOTO_ID } from '../../organizacion'

afterEach(() => vi.restoreAllMocks())

const topeImg = (conReferencia = false) => estimarImagenes('gemini-nano-banana-2.1', 1, { conFoto: true, conReferencia }).topeTotalUsd
const gen = (grupo: number, o: Record<string, unknown> = {}) => ({
  id: `g-${grupo}`,
  estado: 'estimada',
  motor: 'gemini-nano-banana-2.1',
  cantidad: 1,
  foto_id: foto(grupo),
  referencia_foto_id: null,
  costo_estimado_usd: topeImg(),
  grupo,
  ...o,
})
const lote = (o: Record<string, unknown> = {}) => ({ id: ID_LOTE, estado: 'estimado', items: 3, costo_estimado_usd: 3 * topeImg(), vence_en: '2026-10-28T15:15:00Z', tanda_id: 'T', ...o })
const confirmarOk = () => Response.json({ loteId: ID_LOTE, generaciones: [1, 2, 3].map((g) => ({ id: `g-${g}`, grupo: g })) })
const rpcFalla = (status: number, message = 'x') => () => new Response(JSON.stringify({ message }), { status })
const m0 = (o: Mundo = {}) => mundo({ lote: [lote()], generaciones: [gen(1), gen(2), gen(3)], rpc: { confirmar_lote_generacion: confirmarOk }, ...o })
const llamar = (m: ReturnType<typeof mundo>, id = ID_LOTE, cuerpo: unknown = {}, e: Record<string, string | undefined> = entorno, usuario: string | null = 'u-1') =>
  manejarConfirmacionLote(request(`/api/generaciones/lote/${id}/confirmar`, cuerpo, usuario), id, e, m.f)

/** Cada rechazo corta ANTES de Gemini y sin confirmar ninguna. */
const nadaConfirmado = (m: ReturnType<typeof mundo>) => {
  expect(m.gemini).toHaveLength(0)
  expect(m.patches).toHaveLength(0)
}

describe('acceso (R18)', () => {
  it('sin sesión 401, lector 403, sin clave 503: sin RPC y sin Gemini', async () => {
    const a = m0()
    expect((await llamar(a, ID_LOTE, {}, entorno, null)).status).toBe(401)
    const b = m0({ rol: 'lector' })
    expect((await llamar(b)).status).toBe(403)
    const c = m0()
    expect((await llamar(c, ID_LOTE, {}, { ...entorno, GEMINI_API_KEY: '' })).status).toBe(503)
    const d = m0()
    expect((await llamar(d, ID_LOTE, {}, { ...entorno, PRESUPUESTO_MENSUAL_USD: '' })).status).toBe(503)
    for (const m of [a, b, c, d]) {
      expect(m.rpcs).toHaveLength(0)
      nadaConfirmado(m)
    }
  })
  it('el operador confirma', async () => {
    expect((await llamar(m0({ rol: 'operador' }))).status).toBe(200)
  })
})

describe('el lote', () => {
  it('id inválido o lote inexistente: 404', async () => {
    const a = m0()
    expect((await llamar(a, 'abc')).status).toBe(404)
    const b = m0({ lote: [] })
    expect((await llamar(b)).status).toBe(404)
    for (const m of [a, b]) {
      expect(m.rpcs).toHaveLength(0)
      nadaConfirmado(m)
    }
  })
  it('lo lee SOLO de la organización', async () => {
    const m = m0()
    await llamar(m)
    const u = new URL(String(m.f.mock.calls.find(([x]) => new URL(String(x)).pathname === '/rest/v1/lotes_generacion')![0]))
    expect(u.searchParams.get('id')).toBe(`eq.${ID_LOTE}`)
    expect(u.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
  })
  it('si faltan imágenes del lote (alguna ya no está) es 409 sin RPC', async () => {
    const m = m0({ generaciones: [gen(1), gen(2)] })
    expect((await llamar(m)).status).toBe(409)
    expect(m.rpcs).toHaveLength(0)
    nadaConfirmado(m)
  })
  it('un lote que no está estimado (doble click) es 409 sin RPC', async () => {
    const m = m0({ lote: [lote({ estado: 'confirmado' })] })
    expect((await llamar(m)).status).toBe(409)
    expect(m.rpcs).toHaveLength(0)
  })
})

describe('el precio se recalcula en el servidor (409)', () => {
  it('si lo guardado no coincide con la tarifa de hoy, no se confirma', async () => {
    const m = m0({ generaciones: [gen(1), gen(2, { costo_estimado_usd: 0.001 }), gen(3)] })
    const r = await llamar(m)
    expect(r.status).toBe(409)
    expect(((await r.json()) as any).error).toMatch(/precio cambió/)
    expect(m.rpcs).toHaveLength(0)
    nadaConfirmado(m)
  })
  it('una imagen con inspiración se recalcula con la inspiración', async () => {
    const m = m0({ generaciones: [gen(1, { referencia_foto_id: ID_REF, costo_estimado_usd: topeImg(true) }), gen(2), gen(3)] })
    expect((await llamar(m)).status).toBe(200)
  })
  it('un motor sin precio no se ejecuta: 500 sin RPC', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = m0({ generaciones: [gen(1, { motor: 'inventado' }), gen(2), gen(3)] })
    expect((await llamar(m)).status).toBe(500)
    expect(m.rpcs).toHaveLength(0)
  })
})

describe('las fotos se verifican ANTES de la compuerta (404 / 410, sin confirmar nada)', () => {
  it('la foto de una moto inexistente o borrada', async () => {
    const a = m0({ fotos: { faltan: [foto(2)] } })
    expect((await llamar(a)).status).toBe(404)
    const b = m0({ fotos: { borradas: [foto(3)] } })
    expect((await llamar(b)).status).toBe(410)
    for (const m of [a, b]) {
      expect(m.rpcs).toHaveLength(0)
      nadaConfirmado(m)
    }
  })
  it('la inspiración borrada', async () => {
    const m = m0({ generaciones: [gen(1, { referencia_foto_id: ID_REF, costo_estimado_usd: topeImg(true) }), gen(2), gen(3)], ref: 'borrada' })
    expect((await llamar(m)).status).toBe(410)
    expect(m.rpcs).toHaveLength(0)
  })
})

describe('la compuerta: todas o ninguna', () => {
  it('OK: llama a la RPC con el lote, el tope del servidor y el usuario; responde las imágenes confirmadas', async () => {
    const m = m0()
    const r = await llamar(m, ID_LOTE, { p_tope: 9999, tope: 9999, costoEstimadoUsd: 0, p_usuario: 'otro' })
    expect(r.status).toBe(200)
    expect(m.rpcs).toEqual([{ nombre: 'confirmar_lote_generacion', args: { p_lote: ID_LOTE, p_tope: 10, p_usuario: 'u-1' } }])
    const b = (await r.json()) as any
    expect(b.lote).toMatchObject({ id: ID_LOTE, estado: 'confirmado' })
    expect(b.lote.costoEstimadoUsd).toBeCloseTo(3 * topeImg(), 6)
    expect(b.items).toEqual([{ generacionId: 'g-1', grupo: 1 }, { generacionId: 'g-2', grupo: 2 }, { generacionId: 'g-3', grupo: 3 }])
    nadaConfirmado(m)
  })
  it('402: supera el tope. Dice cuánto queda y cuánto cuesta el lote; NO confirma ninguna y no llama a Gemini', async () => {
    const m = m0({ rpc: { confirmar_lote_generacion: rpcFalla(402, 'Supera el tope mensual') }, gastado: 9.9 })
    const r = await llamar(m)
    expect(r.status).toBe(402)
    const b = (await r.json()) as any
    expect(b).toMatchObject({ error: 'Supera el tope mensual.', topeUsd: 10, gastadoUsd: 9.9, restanteUsd: 0.1 })
    expect(b.estimadoUsd).toBeCloseTo(3 * topeImg(), 6)
    expect(m.rpcs).toHaveLength(1)
    nadaConfirmado(m)
  })
  it('409 (alguna ya no está para confirmar o doble click), 410 (venció) y 404: sin Gemini', async () => {
    for (const [status, texto] of [[409, /no se vuelve a cobrar/], [410, /venció/], [404, /No se encontró/]] as const) {
      const m = m0({ rpc: { confirmar_lote_generacion: rpcFalla(status) } })
      const r = await llamar(m)
      expect(r.status).toBe(status)
      expect(((await r.json()) as any).error).toMatch(texto)
      nadaConfirmado(m)
    }
  })
  it('un error inesperado es 500 sin filtrar detalles', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = m0({ rpc: { confirmar_lote_generacion: rpcFalla(500, 'boom interno') } })
    const r = await llamar(m)
    expect(r.status).toBe(500)
    expect(await r.text()).not.toContain('boom')
    nadaConfirmado(m)
  })
})
