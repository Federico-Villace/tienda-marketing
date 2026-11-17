import { describe, it, expect, vi } from 'vitest'
import { leerDetallePromocion, leerListaPromociones } from './pantalla'
import { MARCAS } from '../datos/marcas'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { copyDePrueba, filaPromocion, ID_FOTO, ID_PROMO } from './fixture'
import type { MotoExtra } from './varias/tipos'

const s = { url: 'https://abc.supabase.co', secretKey: 'sb_secret_xyz' }
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const F2 = '22222222-2222-4222-8222-222222222222'
const F3 = '33333333-3333-4333-8333-333333333333'
const ruta = (id: string) => `${ORGANIZACION_PILOTO_ID}/${id}.jpg`
const extra = (fotoId: string, n: number, o: Partial<MotoExtra> = {}): MotoExtra => ({ fotoId, modelo: `MOTO ${n}`, precio: { moneda: 'ARS', monto: n * 1_000_000 }, promo: { tipo: 'cuotas', detalle: '12 cuotas sin interés' }, ...o })
const varias = (o: Record<string, unknown> = {}) =>
  filaPromocion({ id: ID_PROMO, marca_id: MARCAS[3]!.id, foto_id: ID_FOTO, plantilla: 'varias_motos', copy: copyDePrueba(), titular: 'Elegí la tuya', motos_extra: [extra(F2, 2), extra(F3, 3, { promo: { tipo: 'ninguna', detalle: '' } })], ...o } as never)

function mundo(o: { promos?: unknown[]; borrada?: string } = {}) {
  const consultasFotos: URL[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    const p = url.pathname
    if (p === '/rest/v1/promociones') return json(o.promos ?? [varias()])
    if (p === '/rest/v1/fotos') {
      consultasFotos.push(url)
      const ids = (url.searchParams.get('id') ?? '').slice(4, -1).split(',')
      return json(ids.map((id) => ({ id, ruta: id === o.borrada ? null : ruta(id), ancho: 1000, alto: 800, creado_en: '2026-10-25T10:00:00+00:00', borrada_en: id === o.borrada ? '2026-11-01T00:00:00Z' : null })))
    }
    if (['/rest/v1/analisis', '/rest/v1/ediciones_analisis', '/rest/v1/textos_promocion', '/rest/v1/generaciones', '/rest/v1/creativos', '/rest/v1/aprobaciones_promocion', '/rest/v1/verificaciones_texto', '/rest/v1/referencias_diseno'].includes(p)) return json([])
    if (p === '/rest/v1/rpc/gasto_generaciones_mes') return json(0)
    if (p.startsWith('/storage/v1/object/sign/')) {
      const bucket = p.split('/').pop()!
      const b = JSON.parse(String(init?.body))
      return json(b.paths.map((x: string) => ({ path: x, signedURL: `/object/sign/${bucket}/${x}?token=T`, error: null })))
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, consultasFotos }
}

describe('leerDetallePromocion de una placa de varias motos', () => {
  it('trae las fotos de TODAS las motos en una sola consulta', async () => {
    const m = mundo()
    await leerDetallePromocion(s, ID_PROMO, m.f)
    expect(m.consultasFotos).toHaveLength(1)
    expect(m.consultasFotos[0]!.searchParams.get('id')).toBe(`in.(${ID_FOTO},${F2},${F3})`)
  })
  it('motos: cada una con su foto firmada, su modelo, su precio y su condición, la principal primero', async () => {
    const d = (await leerDetallePromocion(s, ID_PROMO, mundo().f))!
    expect(d.motos).toHaveLength(3)
    expect(d.motos!.map((x) => [x.fotoId, x.modelo, x.precio, x.condicion])).toEqual([
      [ID_FOTO, 'TRK 502', '$ 4.500.000', '12 cuotas sin interés'],
      [F2, 'MOTO 2', '$ 2.000.000', '12 cuotas sin interés'],
      [F3, 'MOTO 3', '$ 3.000.000', ''],
    ])
    expect(d.motos![1]!.url).toContain(ruta(F2))
    expect(d.motos!.every((x) => x.borrada === false)).toBe(true)
    expect(d.promocion.motosExtra).toHaveLength(2)
  })
  it('una foto borrada se marca y no lleva URL', async () => {
    const d = (await leerDetallePromocion(s, ID_PROMO, mundo({ borrada: F3 }).f))!
    expect(d.motos![2]).toMatchObject({ borrada: true, url: null })
    expect(d.motos![0]!.borrada).toBe(false)
  })
  it('una promoción de una moto sola no trae `motos` y pide solo su foto', async () => {
    const m = mundo({ promos: [filaPromocion({ id: ID_PROMO, foto_id: ID_FOTO, copy: copyDePrueba() } as never)] })
    const d = (await leerDetallePromocion(s, ID_PROMO, m.f))!
    expect('motos' in d).toBe(false)
    expect(m.consultasFotos[0]!.searchParams.get('id')).toBe(`in.(${ID_FOTO})`)
  })
})

describe('la lista con una placa de varias motos', () => {
  it('el modelo dice cuántas más lleva', async () => {
    const m = mundo()
    const r = await leerListaPromociones(s, m.f)
    expect(r.borradores[0]!.modelo).toBe('TRK 502 + 2 más')
  })
  it('una moto sola, como siempre', async () => {
    const r = await leerListaPromociones(s, mundo({ promos: [filaPromocion({ id: 'a', marca_id: MARCAS[3]!.id } as never)] }).f)
    expect(r.borradores[0]!.modelo).toBe('TRK 502')
  })
})
