import { describe, it, expect, vi, afterEach } from 'vitest'
import { manejarConfirmacionLote } from './confirmar'
import { entorno, foto, ID_LOTE, ID_REF, mundo, request, type Mundo } from './mundo-fixture'
import { estimarCopiaFiel } from '../../promocion/copia/precios'
import { estimarImagenes } from '../precios'

afterEach(() => vi.restoreAllMocks())

const PRO = 'gemini-3-pro-image'
const VERIF = 'gemini-4-argon'
const hash = (n: number) => String(n).repeat(64).slice(0, 64)
const topeCopia = (variantes = 1, verif = VERIF) => estimarCopiaFiel(PRO, variantes, verif, 2).topeTotalUsd
/** Una generación de copia fiel de un lote (de una tanda de marcas: sin grupo). */
const gen = (n: number, o: Record<string, unknown> = {}) => ({
  id: `g-${n}`,
  estado: 'estimada',
  motor: PRO,
  cantidad: 1,
  foto_id: foto(1),
  referencia_foto_id: ID_REF,
  costo_estimado_usd: topeCopia(),
  grupo: null,
  textos_esperados: { modelo: 'ROUSER 200', ocultos: [] },
  textos_hash: hash(n),
  modelo_verificacion: VERIF,
  ...o,
})
const lote = (items: number, o: Record<string, unknown> = {}) => ({ id: ID_LOTE, estado: 'estimado', items, costo_estimado_usd: items * topeCopia(), vence_en: '2026-10-28T15:15:00Z', tanda_id: 'T', ...o })
const confirmarOk = () => Response.json({ loteId: ID_LOTE, generaciones: [{ id: 'g-1', grupo: null }, { id: 'g-2', grupo: null }] })
const m0 = (o: Mundo = {}) => mundo({ lote: [lote(2)], generaciones: [gen(1), gen(2)], rpc: { confirmar_lote_generacion: confirmarOk }, ...o })
const llamar = (m: ReturnType<typeof mundo>, e: Record<string, string | undefined> = entorno) => manejarConfirmacionLote(request(`/api/generaciones/lote/${ID_LOTE}/confirmar`, {}), ID_LOTE, e, m.f)
const sinCompuerta = (m: ReturnType<typeof mundo>) => {
  expect(m.rpcs.filter((r) => r.nombre === 'confirmar_lote_generacion')).toHaveLength(0)
  expect(m.gemini).toHaveLength(0)
}

describe('confirmar un lote de copia fiel: el total incluye la revisión de textos', () => {
  it('con el precio que se mostró (imágenes + revisión de cada variante) confirma TODO junto, una sola vez, y devuelve el total', async () => {
    const m = m0()
    const r = await llamar(m)
    expect(r.status).toBe(200)
    expect(m.rpcs.filter((x) => x.nombre === 'confirmar_lote_generacion')).toHaveLength(1)
    expect(((await r.json()) as any).lote.costoEstimadoUsd).toBeCloseTo(2 * topeCopia(), 6)
    expect(m.gemini).toHaveLength(0)
  })

  it('un estimado que NO incluye la revisión (solo las imágenes) es 409 sin confirmar nada', async () => {
    const solo = estimarImagenes(PRO, 1, { imagenesEntrada: 2 }).topeTotalUsd
    const m = m0({ generaciones: [gen(1, { costo_estimado_usd: solo }), gen(2)] })
    expect((await llamar(m)).status).toBe(409)
    sinCompuerta(m)
  })

  it('con 2 variantes la revisión también es de las dos', async () => {
    const m = m0({ generaciones: [gen(1, { cantidad: 2, costo_estimado_usd: topeCopia(2) }), gen(2, { cantidad: 2, costo_estimado_usd: topeCopia(2) })] })
    expect((await llamar(m)).status).toBe(200)
    const mala = m0({ generaciones: [gen(1, { cantidad: 2 }), gen(2)] })
    expect((await llamar(mala)).status).toBe(409)
    sinCompuerta(mala)
  })

  it('un modelo de revisión sin precio es 500 ANTES de la compuerta', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = m0({ generaciones: [gen(1, { modelo_verificacion: 'modelo-inventado' }), gen(2)] })
    expect((await llamar(m)).status).toBe(500)
    sinCompuerta(m)
  })

  it('las fotos de la moto y de la referencia se verifican ANTES de la compuerta: borrada 410, sin confirmar nada', async () => {
    const a = m0({ fotos: { borradas: [foto(1)] } })
    expect((await llamar(a)).status).toBe(410)
    sinCompuerta(a)
    const b = m0({ ref: 'borrada' })
    expect((await llamar(b)).status).toBe(410)
    sinCompuerta(b)
  })

  it('402: supera el tope. Cuesta lo mismo que dijo la pantalla y no se confirma ninguna', async () => {
    const m = m0({ gastado: 9.9, rpc: { confirmar_lote_generacion: () => new Response(JSON.stringify({ message: 'x' }), { status: 402 }) } })
    const r = await llamar(m)
    expect(r.status).toBe(402)
    expect(((await r.json()) as any).estimadoUsd).toBeCloseTo(2 * topeCopia(), 6)
    expect(m.gemini).toHaveLength(0)
  })

  it('el lector no confirma: 403 sin tocar nada', async () => {
    const m = m0({ rol: 'lector' })
    expect((await llamar(m)).status).toBe(403)
    expect(m.rpcs).toHaveLength(0)
  })

  it('un lote de siempre (sin textos esperados) se sigue recalculando como imágenes', async () => {
    const tope = estimarImagenes('gemini-nano-banana-2.1', 1, { conFoto: true }).topeTotalUsd
    const m = mundo({
      lote: [{ ...lote(1), costo_estimado_usd: tope }],
      generaciones: [gen(1, { motor: 'gemini-nano-banana-2.1', referencia_foto_id: null, costo_estimado_usd: tope, textos_esperados: null, textos_hash: null, modelo_verificacion: null, grupo: 1 })],
      rpc: { confirmar_lote_generacion: () => Response.json({ loteId: ID_LOTE, generaciones: [{ id: 'g-1', grupo: 1 }] }) },
    })
    expect((await llamar(m)).status).toBe(200)
  })
})
