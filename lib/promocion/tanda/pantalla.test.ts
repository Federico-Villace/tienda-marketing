import { describe, it, expect, vi } from 'vitest'
import { leerTanda } from './pantalla'
import { MARCAS } from '../../datos/marcas'
import { ORGANIZACION_PILOTO_ID } from '../../organizacion'
import { copyDePrueba, filaPromocion, ID_ESCENA, ID_FOTO } from '../fixture'

const s = { url: 'https://abc.supabase.co', secretKey: 'sb_secret_xyz' }
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const ID_TANDA = '55555555-5555-4555-8555-555555555555'
const ID_INSPIRACION = '77777777-7777-4777-8777-777777777777'
const RUTA_INSPIRACION = `${ORGANIZACION_PILOTO_ID}/${ID_INSPIRACION}.jpg`
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

type Mundo = { tanda?: unknown[]; hijas?: unknown[]; gens?: unknown[]; creativos?: unknown[]; gasto?: number; textos?: unknown[]; fotoBorrada?: boolean; inspiracion?: 'ok' | 'borrada' }
function mundo(o: Mundo = {}) {
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    const p = url.pathname
    if (url.hostname !== 'abc.supabase.co') throw new Error(`no se llama a ${url.hostname}`)
    if (p === '/rest/v1/tandas_promocion') return json(o.tanda ?? [{ id: ID_TANDA, creado_en: '2026-10-25T12:00:00+00:00' }])
    if (p === '/rest/v1/promociones') return json(o.hijas ?? [hija(2), hija(3), hija(5)])
    if (p === '/rest/v1/fotos') {
      const moto = { id: ID_FOTO, ruta: RUTA_FOTO, ancho: 1000, alto: 1200, borrada_en: o.fotoBorrada ? '2026-10-26T00:00:00Z' : null }
      if (!o.inspiracion) return json([moto])
      return json([moto, { id: ID_INSPIRACION, ruta: o.inspiracion === 'borrada' ? null : RUTA_INSPIRACION, ancho: 1500, alto: 1000, borrada_en: o.inspiracion === 'borrada' ? '2026-10-26T00:00:00Z' : null }])
    }
    if (p === '/rest/v1/textos_promocion') return json(o.textos ?? [])
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

  it('trae las opciones de texto de las hijas en borrador que ya las pidieron', async () => {
    const opciones = [copyDePrueba(), copyDePrueba(), copyDePrueba()]
    const m = mundo({ hijas: [hija(2, { textos_id: 'tx1' }), hija(3)], textos: [{ id: 'tx1', opciones, datos_hash: 'otro' }] })
    const t = (await leerTanda(s, ID_TANDA, m.f))!
    expect(t.hijas[0]!.textos).toMatchObject({ id: 'tx1', desactualizado: true })
    expect(t.hijas[0]!.textos!.opciones).toHaveLength(3)
    expect(t.hijas[1]!.textos).toBeNull()
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

  it('trae la foto de inspiración de la tanda (la de la primera hija viva), firmada y sin ruta', async () => {
    const m = mundo({ inspiracion: 'ok', hijas: [hija(2, { inspiracion_foto_id: ID_INSPIRACION }), hija(3, { inspiracion_foto_id: ID_INSPIRACION })] })
    const t = (await leerTanda(s, ID_TANDA, m.f))!
    expect(t.inspiracion).toMatchObject({ id: ID_INSPIRACION, borrada: false })
    expect(t.inspiracion!.url).toContain(RUTA_INSPIRACION)
    expect(Object.keys(t.inspiracion!).sort()).toEqual(['borrada', 'id', 'url'])
    expect(t.foto).toMatchObject({ id: ID_FOTO })
  })
  it('sin inspiración es null; borrada se marca', async () => {
    expect((await leerTanda(s, ID_TANDA, mundo().f))!.inspiracion).toBeNull()
    const b = (await leerTanda(s, ID_TANDA, mundo({ inspiracion: 'borrada', hijas: [hija(2, { inspiracion_foto_id: ID_INSPIRACION })] }).f))!
    expect(b.inspiracion).toMatchObject({ borrada: true, url: null })
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

describe('leerTanda · lotes (ADR-032)', () => {
  const ID_FOTO_2 = '88888888-8888-4888-8888-888888888888'
  const RUTA_FOTO_2 = `${ORGANIZACION_PILOTO_ID}/${ID_FOTO_2}.jpg`

  /** Lote de 2 motos × 2 marcas: las hijas llegan desordenadas (mismo creado_en en la base). */
  const hijasMotos = (o: Record<string, unknown> = {}) => [
    hija(3, { id: 'b-m3', grupo: 2, foto_id: ID_FOTO_2, modelo: 'Leoncino', ...o }),
    hija(2, { id: 'a-m2', grupo: 1, ...o }),
    hija(2, { id: 'b-m2', grupo: 2, foto_id: ID_FOTO_2, modelo: 'Leoncino', ...o }),
    hija(3, { id: 'a-m3', grupo: 1, ...o }),
  ]
  const fotos = (url: URL) => {
    const ids = (url.searchParams.get('id') ?? '').replace(/^in\.\(|\)$/g, '').split(',')
    return [
      { id: ID_FOTO, ruta: RUTA_FOTO, ancho: 1000, alto: 1200, borrada_en: null },
      { id: ID_FOTO_2, ruta: RUTA_FOTO_2, ancho: 1200, alto: 1000, borrada_en: null },
    ].filter((x) => ids.includes(x.id))
  }
  function mundoLote(o: { tipo?: string; hijas?: unknown[]; gens?: unknown[]; creativos?: unknown[] } = {}) {
    const f = vi.fn<typeof fetch>(async (u, init) => {
      const url = new URL(String(u))
      const p = url.pathname
      if (p === '/rest/v1/tandas_promocion') return json([{ id: ID_TANDA, creado_en: '2026-10-25T12:00:00+00:00', tipo: o.tipo ?? 'motos' }])
      if (p === '/rest/v1/promociones') return json(o.hijas ?? hijasMotos())
      if (p === '/rest/v1/fotos') return json(fotos(url))
      if (p === '/rest/v1/generaciones') return json(o.gens ?? [])
      if (p === '/rest/v1/creativos') return json(o.creativos ?? [])
      if (p === '/rest/v1/rpc/gasto_generaciones_mes') return json(0)
      if (p.startsWith('/storage/v1/object/sign/')) {
        const bucket = p.split('/').pop()!
        const b = JSON.parse(String(init?.body))
        return json(b.paths.map((x: string) => ({ path: x, signedURL: `/object/sign/${bucket}/${x}?token=T`, error: null })))
      }
      throw new Error(`URL inesperada: ${url}`)
    })
    return { f }
  }
  const genLote = (id: string, grupo: number, estado: string, o: Record<string, unknown> = {}) => ({
    ...gen,
    id,
    foto_id: grupo === 1 ? ID_FOTO : ID_FOTO_2,
    grupo,
    lote_id: 'lote-1',
    estado,
    confirmada_en: '2026-10-25T12:01:00+00:00',
    ...o,
  })

  it('trae el tipo de la tanda (y las viejas, sin tipo, son de marcas)', async () => {
    expect((await leerTanda(s, ID_TANDA, mundoLote().f))!.tipo).toBe('motos')
    expect((await leerTanda(s, ID_TANDA, mundoLote({ tipo: 'textos', hijas: [hija(2, { variante: 1 })] }).f))!.tipo).toBe('textos')
    const vieja = mundo()
    expect((await leerTanda(s, ID_TANDA, vieja.f))!.tipo).toBe('marcas')
  })

  it('pide el tipo en el select de la tanda', async () => {
    const m = mundoLote()
    await leerTanda(s, ID_TANDA, m.f)
    const u = new URL(String(m.f.mock.calls.find(([x]) => new URL(String(x)).pathname === '/rest/v1/tandas_promocion')![0]))
    expect(u.searchParams.get('select')).toBe('id,creado_en,tipo')
  })

  it('ordena las hijas de un lote por moto, variante y orden de las marcas', async () => {
    const t = (await leerTanda(s, ID_TANDA, mundoLote().f))!
    expect(t.hijas.map((h) => h.promocion.id)).toEqual(['a-m2', 'a-m3', 'b-m2', 'b-m3'])
  })

  it('arma un grupo por moto con su modelo, su foto firmada y sus hijas', async () => {
    const t = (await leerTanda(s, ID_TANDA, mundoLote().f))!
    expect(t.grupos.map((g) => [g.grupo, g.modelo, g.hijaIds])).toEqual([
      [1, 'TRK 502', ['a-m2', 'a-m3']],
      [2, 'Leoncino', ['b-m2', 'b-m3']],
    ])
    expect(t.grupos[0]!.foto).toMatchObject({ id: ID_FOTO, borrada: false })
    expect(t.grupos[0]!.foto!.url).toContain(RUTA_FOTO)
    expect(t.grupos[1]!.foto!.url).toContain(RUTA_FOTO_2)
    expect(t.foto).toMatchObject({ id: ID_FOTO })
  })

  it('una tanda de marcas tiene un solo grupo (grupo null) con todas las hijas', async () => {
    const t = (await leerTanda(s, ID_TANDA, mundo().f))!
    expect(t.grupos).toHaveLength(1)
    expect(t.grupos[0]).toMatchObject({ grupo: null, modelo: 'TRK 502' })
    expect(t.grupos[0]!.hijaIds).toEqual(['hija-2', 'hija-3', 'hija-5'])
  })

  it('compartenEscena se evalúa POR MOTO: fotos distintas entre motos no es un conflicto, un fondo distinto dentro de una moto sí', async () => {
    const ok = (await leerTanda(s, ID_TANDA, mundoLote().f))!
    expect(ok.comparten).toEqual({ ok: true })
    expect(ok.grupos.every((g) => g.comparten.ok)).toBe(true)
    const mal = (await leerTanda(s, ID_TANDA, mundoLote({ hijas: [hija(2, { id: 'a', grupo: 1 }), hija(3, { id: 'b', grupo: 1, fondo: 'escenario_ruta' }), hija(2, { id: 'c', grupo: 2, foto_id: ID_FOTO_2 })] }).f))!
    expect(mal.grupos[0]!.comparten).toEqual({ ok: false, difieren: ['fondo'] })
    expect(mal.grupos[1]!.comparten).toEqual({ ok: true })
    expect(mal.comparten).toEqual({ ok: false, difieren: ['fondo'] })
  })

  it('cada escena va al grupo de su moto; las de tanda de marcas (sin grupo) siguen en el único grupo', async () => {
    const t = (await leerTanda(s, ID_TANDA, mundoLote({ gens: [genLote('g1', 1, 'ok'), genLote('g2', 2, 'ok')], creativos: [creativo('c1')] }).f))!
    expect(t.grupos[0]!.escenas.map((e) => e.generacion.id)).toEqual(['g1'])
    expect(t.grupos[1]!.escenas.map((e) => e.generacion.id)).toEqual(['g2'])
    expect(t.escenas).toHaveLength(2)
    const vieja = (await leerTanda(s, ID_TANDA, mundo({ gens: [gen] }).f))!
    expect(vieja.grupos[0]!.escenas.map((e) => e.generacion.id)).toEqual(['g1'])
  })

  it('"usadaEn" de una escena cuenta solo las hijas de su moto', async () => {
    const m = mundoLote({ hijas: hijasMotos({ escena_creativo_id: 'c1' }), gens: [genLote('g1', 1, 'ok')], creativos: [creativo('c1')] })
    const t = (await leerTanda(s, ID_TANDA, m.f))!
    expect(t.grupos[0]!.escenas[0]!.creativos[0]!.usadaEn).toBe(2)
  })

  it('pendientes: lo confirmado o corriendo de un lote, con su moto, para generar o liberar', async () => {
    const m = mundoLote({
      gens: [genLote('g1', 1, 'confirmada'), genLote('g2', 2, 'corriendo', { confirmada_en: '2026-10-25T11:00:00+00:00' }), genLote('g3', 1, 'ok')],
    })
    const t = (await leerTanda(s, ID_TANDA, m.f, () => Date.parse('2026-10-25T12:02:00+00:00')))!
    expect(t.pendientes).toEqual([
      { generacionId: 'g1', loteId: 'lote-1', grupo: 1, modelo: 'TRK 502', estado: 'confirmada', interrumpida: false, costoEstimadoUsd: 0.09 },
      { generacionId: 'g2', loteId: 'lote-1', grupo: 2, modelo: 'Leoncino', estado: 'corriendo', interrumpida: true, costoEstimadoUsd: 0.09 },
    ])
  })

  it('una escena suelta confirmada (sin lote) no es un pendiente de lote', async () => {
    const t = (await leerTanda(s, ID_TANDA, mundo({ gens: [{ ...gen, estado: 'confirmada' }] }).f))!
    expect(t.pendientes).toEqual([])
  })

  it('pide a la base la columna grupo y lote_id de las generaciones', async () => {
    const m = mundoLote()
    await leerTanda(s, ID_TANDA, m.f)
    const u = new URL(String(m.f.mock.calls.find(([x]) => new URL(String(x)).pathname === '/rest/v1/generaciones')![0]))
    expect(u.searchParams.get('select')).toContain('grupo')
    expect(u.searchParams.get('select')).toContain('lote_id')
  })
})
