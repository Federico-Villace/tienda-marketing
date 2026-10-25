import { describe, it, expect, vi } from 'vitest'
import { leerTanda } from './pantalla'
import { MARCAS } from '../../datos/marcas'
import { ORGANIZACION_PILOTO_ID } from '../../organizacion'
import { copyDePrueba, filaPromocion, ID_ESCENA, ID_FOTO } from '../fixture'

const s = { url: 'https://abc.supabase.co', secretKey: 'sb_secret_xyz' }
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const ID_TANDA = '55555555-5555-4555-8555-555555555555'
const RUTA_FOTO = `${ORGANIZACION_PILOTO_ID}/${ID_FOTO}.jpg`
const RUTA_PLACA = (i: number) => `${ORGANIZACION_PILOTO_ID}/promociones/hija-${i}/abc.png`

const hija = (i: number, o: Record<string, unknown> = {}) =>
  filaPromocion({
    id: `hija-${i}`,
    marca_id: MARCAS[i]!.id,
    tanda_id: ID_TANDA,
    foto_id: ID_FOTO,
    plantilla: 'oferta_abajo',
    fondo: 'fondo_estudio',
    creado_en: `2026-10-25T12:00:0${i}+00:00`,
    ...o,
  } as never)

type Mundo = { tanda?: unknown[]; hijas?: unknown[]; gens?: unknown[]; creativos?: unknown[]; gasto?: number; fotoBorrada?: boolean }
function mundo(o: Mundo = {}) {
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    const p = url.pathname
    if (url.hostname !== 'abc.supabase.co') throw new Error(`no se llama a ${url.hostname}`)
    if (p === '/rest/v1/tandas_promocion') return json(o.tanda ?? [{ id: ID_TANDA, creado_en: '2026-10-25T12:00:00+00:00' }])
    if (p === '/rest/v1/promociones') return json(o.hijas ?? [hija(2), hija(3), hija(5)])
    if (p === '/rest/v1/fotos') return json([{ id: ID_FOTO, ruta: RUTA_FOTO, ancho: 1000, alto: 1200, borrada_en: o.fotoBorrada ? '2026-10-26T00:00:00Z' : null }])
    if (p === '/rest/v1/generaciones') return json(o.gens ?? [])
    if (p === '/rest/v1/creativos') return json(o.creativos ?? [])
    if (p === '/rest/v1/rpc/gasto_generaciones_mes') return json(o.gasto ?? 0)
    if (p.startsWith('/storage/v1/object/sign/')) {
      const bucket = p.split('/').pop()!
      const b = JSON.parse(String(init?.body))
      return json(b.paths.map((x: string) => ({ path: x, signedURL: `/object/sign/${bucket}/${x}?token=T`, error: null })))
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f }
}

const gen = { id: 'g1', pieza_raiz_id: null, foto_id: ID_FOTO, edicion: 'promocion', estado: 'ok', motor: 'gemini-nano-banana-2.1', cantidad: 2, costo_estimado_usd: 0.09, costo_real_usd: 0.08, error: null, creado_en: '2026-10-25T12:00:00+00:00', confirmada_en: '2026-10-25T12:01:00+00:00' }
const creativo = (id: string, ruta: string | null = `${ORGANIZACION_PILOTO_ID}/g1/${id}.jpg`) => ({ id, generacion_id: 'g1', pieza_raiz_id: null, foto_id: ID_FOTO, orden: 1, ruta, ancho: 1024, alto: 1280, costo_usd: 0.04, error: null, elegida: false })

describe('leerTanda', () => {
  it('id inválido o tanda inexistente: null', async () => {
    expect(await leerTanda(s, 'abc', mundo().f)).toBeNull()
    expect(await leerTanda(s, ID_TANDA, mundo({ tanda: [] }).f)).toBeNull()
  })

  it('pide la tanda y sus hijas SOLO de la organización', async () => {
    const m = mundo()
    await leerTanda(s, ID_TANDA, m.f)
    for (const ruta of ['tandas_promocion', 'promociones']) {
      const u = new URL(String(m.f.mock.calls.find(([x]) => new URL(String(x)).pathname === `/rest/v1/${ruta}`)![0]))
      expect(u.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
    }
    const hijas = new URL(String(m.f.mock.calls.find(([x]) => new URL(String(x)).pathname === '/rest/v1/promociones')![0]))
    expect(hijas.searchParams.get('tanda_id')).toBe(`eq.${ID_TANDA}`)
    expect(hijas.searchParams.get('order')).toBe('creado_en.asc,id.asc')
  })

  it('una tarjeta por hija: marca, paso, estado y miniatura (placa si hay, foto si no)', async () => {
    const m = mundo({ hijas: [hija(2), hija(3, { estado: 'aprobada', placa_ruta: RUTA_PLACA(3), placa_hash: 'h', copy: copyDePrueba(), escena_creativo_id: ID_ESCENA })] })
    const t = (await leerTanda(s, ID_TANDA, m.f))!
    expect(t.tanda.id).toBe(ID_TANDA)
    expect(t.hijas.map((h) => [h.marca.nombre, h.promocion.estado, h.promocion.pasoActual])).toEqual([
      [MARCAS[2]!.nombre, 'borrador', 2],
      [MARCAS[3]!.nombre, 'aprobada', 6],
    ])
    expect(t.hijas[0]!.miniatura).toContain(RUTA_FOTO)
    expect(t.hijas[1]!.miniatura).toContain(RUTA_PLACA(3))
  })

  it('cuenta las hijas vivas, las listas para aprobar y las aprobadas', async () => {
    const lista = { copy: copyDePrueba(), escena_creativo_id: ID_ESCENA, titular: 'Tu próxima aventura' }
    const m = mundo({ hijas: [hija(0, lista), hija(2), hija(3, { estado: 'aprobada', placa_ruta: RUTA_PLACA(3), placa_hash: 'h' }), hija(5, { estado: 'descartada' })] })
    const t = (await leerTanda(s, ID_TANDA, m.f))!
    expect(t.resumen).toEqual({ total: 3, aprobadas: 1, listas: 1 })
  })

  it('compartenEscena sale de las hijas en borrador (las aprobadas y descartadas no cuentan)', async () => {
    const m = mundo({ hijas: [hija(0), hija(2, { fondo: 'escenario_ruta' }), hija(3, { estado: 'aprobada', fondo: 'escenario_urbano' })] })
    expect((await leerTanda(s, ID_TANDA, m.f))!.comparten).toEqual({ ok: false, difieren: ['fondo'] })
    const iguales = mundo({ hijas: [hija(0), hija(2), hija(3, { estado: 'descartada', fondo: 'escenario_urbano' })] })
    expect((await leerTanda(s, ID_TANDA, iguales.f))!.comparten).toEqual({ ok: true })
  })

  it('las escenas de la tanda llegan firmadas y dicen en cuántas hijas se usa cada una', async () => {
    const m = mundo({
      hijas: [hija(2, { escena_creativo_id: 'c1' }), hija(3, { escena_creativo_id: 'c1' }), hija(5, { escena_creativo_id: null })],
      gens: [gen],
      creativos: [creativo('c1'), creativo('c2'), creativo('c3', null)],
    })
    const t = (await leerTanda(s, ID_TANDA, m.f))!
    expect(t.escenas).toHaveLength(1)
    expect(t.escenas[0]!.generacion).toMatchObject({ id: 'g1', estado: 'ok' })
    expect(t.escenas[0]!.creativos.map((c) => [c.id, c.usadaEn, Boolean(c.url)])).toEqual([['c1', 2, true], ['c2', 0, true], ['c3', 0, false]])
    const u = new URL(String(m.f.mock.calls.find(([x]) => new URL(String(x)).pathname === '/rest/v1/generaciones')![0]))
    expect(u.searchParams.get('tanda_id')).toBe(`eq.${ID_TANDA}`)
    expect(u.searchParams.get('estado')).toBe('neq.estimada')
  })

  it('trae el gasto del mes y si la foto se borró', async () => {
    const t = (await leerTanda(s, ID_TANDA, mundo({ gasto: 1.2345678, fotoBorrada: true }).f))!
    expect(t.gastadoUsd).toBe(1.234568)
    expect(t.foto).toMatchObject({ id: ID_FOTO, borrada: true })
  })

  it('nunca expone rutas ni la organización', async () => {
    const m = mundo({ hijas: [hija(3, { estado: 'aprobada', placa_ruta: RUTA_PLACA(3), placa_hash: 'h' })] })
    const json = JSON.stringify(await leerTanda(s, ID_TANDA, m.f))
    expect(json).not.toContain('organizacion_id')
    expect(json).not.toContain('placa_ruta')
    expect(json).not.toContain('placaRuta')
  })
})
