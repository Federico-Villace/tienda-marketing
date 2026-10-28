import { describe, it, expect, vi } from 'vitest'
import { leerDetallePromocion, leerFotosParaPromocion, leerListaPromociones } from './pantalla'
import { MARCAS } from '../datos/marcas'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { hashDatos } from './datos'
import { copyDePrueba, datosDePrueba, filaPromocion, ID_ESCENA, ID_FOTO, ID_PROMO } from './fixture'

const s = { url: 'https://abc.supabase.co', secretKey: 'sb_secret_xyz' }
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const RUTA_FOTO = `${ORGANIZACION_PILOTO_ID}/${ID_FOTO}.jpg`
const RUTA_PLACA = `${ORGANIZACION_PILOTO_ID}/promociones/${ID_PROMO}/abc123abc123.png`

type Mundo = { promos?: unknown[]; fotos?: unknown[]; analisis?: unknown[]; ediciones?: unknown[]; textos?: unknown[]; gens?: unknown[]; creativos?: unknown[]; aprobaciones?: unknown[]; gasto?: number; firmaFalla?: boolean }
function mundo(o: Mundo = {}) {
  const firmas: { bucket: string; paths: string[]; url: string }[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    const p = url.pathname
    if (url.hostname !== 'abc.supabase.co') throw new Error(`no se llama a ${url.hostname}`)
    if (p === '/rest/v1/promociones') return json(o.promos ?? [])
    if (p === '/rest/v1/fotos') return json(o.fotos ?? [{ id: ID_FOTO, ruta: RUTA_FOTO, ancho: 1000, alto: 1200, creado_en: '2026-10-25T10:00:00+00:00', borrada_en: null }])
    if (p === '/rest/v1/analisis') return json(o.analisis ?? [])
    if (p === '/rest/v1/ediciones_analisis') return json(o.ediciones ?? [])
    if (p === '/rest/v1/textos_promocion') return json(o.textos ?? [])
    if (p === '/rest/v1/generaciones') return json(o.gens ?? [])
    if (p === '/rest/v1/creativos') return json(o.creativos ?? [])
    if (p === '/rest/v1/aprobaciones_promocion') return json(o.aprobaciones ?? [])
    if (p === '/rest/v1/rpc/gasto_generaciones_mes') return json(o.gasto ?? 0)
    if (p.startsWith('/storage/v1/object/sign/')) {
      if (o.firmaFalla) return json({ message: 'no' }, 500)
      const bucket = p.split('/').pop()!
      const b = JSON.parse(String(init?.body))
      for (const x of b.paths) firmas.push({ bucket, paths: [x], url: '' })
      return json(b.paths.map((x: string) => ({ path: x, signedURL: `/object/sign/${bucket}/${x}?token=T`, error: null })))
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, firmas }
}

const completa = (o: Record<string, unknown> = {}) =>
  filaPromocion({ id: ID_PROMO, marca_id: MARCAS[3]!.id, foto_id: ID_FOTO, plantilla: 'oferta_abajo', fondo: 'fondo_estudio', copy: copyDePrueba(), titular: 'Tu próxima aventura', escena_creativo_id: ID_ESCENA, ...o } as never)

describe('leerListaPromociones', () => {
  it('separa borradores y aprobadas, con marca, precio formateado y paso', async () => {
    const m = mundo({ promos: [completa({ id: 'a' }), completa({ id: 'b', estado: 'aprobada', placa_ruta: RUTA_PLACA, placa_hash: 'h' }), filaPromocion({ id: 'c', marca_id: MARCAS[0]!.id })] })
    const r = await leerListaPromociones(s, m.f)
    expect(r.borradores.map((x) => x.id)).toEqual(['a', 'c'])
    expect(r.aprobadas.map((x) => x.id)).toEqual(['b'])
    expect(r.borradores[0]).toMatchObject({ marca: MARCAS[3]!.nombre, modelo: 'TRK 502', precio: '$ 4.500.000', pasoActual: 4 })
    expect(r.borradores[1]!.pasoActual).toBe(2)
  })
  it('pide borradores, aprobadas y descartadas, las últimas 200 de la organización', async () => {
    const m = mundo()
    await leerListaPromociones(s, m.f)
    const url = new URL(String(m.f.mock.calls[0]![0]))
    expect(url.searchParams.get('estado')).toBe('in.(borrador,aprobada,descartada)')
    expect(url.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
    expect(url.searchParams.get('order')).toBe('actualizado_en.desc')
    expect(url.searchParams.get('limit')).toBe('200')
  })
  it('las descartadas van aparte, y "truncada" avisa si se llegó al tope', async () => {
    const r = await leerListaPromociones(s, mundo({ promos: [completa({ id: 'a' }), completa({ id: 'x', estado: 'descartada' })] }).f)
    expect(r.borradores.map((x) => x.id)).toEqual(['a'])
    expect(r.descartadas.map((x) => x.id)).toEqual(['x'])
    expect(r.truncada).toBe(false)
    const tope = Array.from({ length: 200 }, (_, i) => completa({ id: `p${i}` }))
    expect((await leerListaPromociones(s, mundo({ promos: tope }).f)).truncada).toBe(true)
  })
  it('si le dicen cuáles se ven, firma miniatura y descarga solo de esas (las demás quedan sin imagen)', async () => {
    const m = mundo({ promos: [completa({ id: 'a' }), completa({ id: 'b', estado: 'aprobada', placa_ruta: RUTA_PLACA, placa_hash: 'h' })] })
    const r = await leerListaPromociones(s, m.f, (l) => l.aprobadas)
    expect(r.aprobadas[0]!.miniatura).toContain(RUTA_PLACA)
    expect(r.borradores[0]!.miniatura).toBeNull()
    expect(m.firmas.some((x) => x.paths[0] === RUTA_FOTO)).toBe(false)
  })
  it('las aprobadas traen miniatura y descarga de la placa; los borradores, la foto', async () => {
    const m = mundo({ promos: [completa({ id: 'a' }), completa({ id: 'b', estado: 'aprobada', placa_ruta: RUTA_PLACA, placa_hash: 'h' })] })
    const r = await leerListaPromociones(s, m.f)
    expect(r.aprobadas[0]!.miniatura).toContain(RUTA_PLACA)
    expect(r.aprobadas[0]!.descarga).toContain('download=')
    expect(r.borradores[0]!.miniatura).toContain(RUTA_FOTO)
  })
  it('no expone rutas ni la organización', async () => {
    const m = mundo({ promos: [completa({ estado: 'aprobada', placa_ruta: RUTA_PLACA, placa_hash: 'h' })] })
    const r = await leerListaPromociones(s, m.f)
    const { miniatura, descarga, ...resto } = r.aprobadas[0]!
    expect(JSON.stringify(resto)).not.toContain(ORGANIZACION_PILOTO_ID)
  })
  it('sin promociones no pide nada más; si no se puede firmar, la lista igual sale', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await leerListaPromociones(s, mundo().f)).toEqual({ borradores: [], aprobadas: [], descartadas: [], truncada: false })
    const r = await leerListaPromociones(s, mundo({ promos: [completa()], firmaFalla: true }).f)
    expect(r.borradores[0]!.miniatura).toBeNull()
  })
})

describe('leerDetallePromocion', () => {
  it('devuelve null si no existe', async () => {
    expect(await leerDetallePromocion(s, ID_PROMO, mundo().f)).toBeNull()
    expect(await leerDetallePromocion(s, 'abc', mundo().f)).toBeNull()
  })

  it('arma la promoción, la marca y la foto firmada', async () => {
    const m = mundo({ promos: [completa()] })
    const d = (await leerDetallePromocion(s, ID_PROMO, m.f))!
    expect(d.promocion).toMatchObject({ id: ID_PROMO, pasoActual: 4, modelo: 'TRK 502' })
    expect(d.marca).toEqual({ id: MARCAS[3]!.id, nombre: MARCAS[3]!.nombre, usuarioIg: MARCAS[3]!.usuarioIg })
    expect(d.foto).toMatchObject({ id: ID_FOTO, ancho: 1000, alto: 1200, borrada: false })
    expect(d.foto!.url).toContain(RUTA_FOTO)
    expect(d.analisis).toBeNull()
    expect(d.textos).toBeNull()
    expect(d.placa).toBeNull()
    expect(d.aprobaciones).toEqual([])
  })

  it('trae la foto de inspiración firmada, sin la ruta; sin inspiración es null', async () => {
    const ID_INSP = '77777777-7777-4777-8777-777777777777'
    const RUTA_INSP = `${ORGANIZACION_PILOTO_ID}/${ID_INSP}.jpg`
    const fotos = [
      { id: ID_FOTO, ruta: RUTA_FOTO, ancho: 1000, alto: 1200, creado_en: 'x', borrada_en: null },
      { id: ID_INSP, ruta: RUTA_INSP, ancho: 1500, alto: 1000, creado_en: 'x', borrada_en: null },
    ]
    const m = mundo({ promos: [completa({ inspiracion_foto_id: ID_INSP })], fotos })
    const d = (await leerDetallePromocion(s, ID_PROMO, m.f))!
    expect(d.inspiracion).toMatchObject({ id: ID_INSP, borrada: false })
    expect(d.inspiracion!.url).toContain(RUTA_INSP)
    expect(d.foto).toMatchObject({ id: ID_FOTO })
    expect(Object.keys(d.inspiracion!).sort()).toEqual(['borrada', 'id', 'url'])
    const sin = (await leerDetallePromocion(s, ID_PROMO, mundo({ promos: [completa()] }).f))!
    expect(sin.inspiracion).toBeNull()
  })

  it('una inspiración borrada se marca y no lleva URL', async () => {
    const ID_INSP = '77777777-7777-4777-8777-777777777777'
    const m = mundo({ promos: [completa({ inspiracion_foto_id: ID_INSP })], fotos: [
      { id: ID_FOTO, ruta: RUTA_FOTO, ancho: 1000, alto: 1200, creado_en: 'x', borrada_en: null },
      { id: ID_INSP, ruta: null, ancho: 1500, alto: 1000, creado_en: 'x', borrada_en: '2026-10-24T00:00:00Z' },
    ] })
    const d = (await leerDetallePromocion(s, ID_PROMO, m.f))!
    expect(d.inspiracion).toMatchObject({ id: ID_INSP, borrada: true, url: null })
  })

  it('una foto borrada se marca y no lleva URL', async () => {
    const m = mundo({ promos: [completa()], fotos: [{ id: ID_FOTO, ruta: null, ancho: 1000, alto: 1200, creado_en: 'x', borrada_en: '2026-10-24T00:00:00Z' }] })
    const d = (await leerDetallePromocion(s, ID_PROMO, m.f))!
    expect(d.foto).toMatchObject({ borrada: true, url: null })
  })

  it('trae el análisis vigente (con su última edición) cuando la promoción lo tiene', async () => {
    const m = mundo({
      promos: [completa({ analisis_id: 'an1' })],
      analisis: [{ id: 'an1', contenido: 'Original', modelo: 'gpt-6-luna', costo_usd: '0.001', tokens_entrada: 1, tokens_salida: 1, creado_en: '2026-10-25T10:00:00+00:00', filtros: {} }],
      ediciones: [{ id: 'e2', analisis_id: 'an1', version: 2, contenido: 'Editado', editado_por: 'u', editado_en: '2026-10-25T11:00:00+00:00' }],
    })
    const d = (await leerDetallePromocion(s, ID_PROMO, m.f))!
    expect(d.analisis).toMatchObject({ id: 'an1', contenido: 'Editado', original: 'Original', version: 2 })
  })

  it('los textos guardados avisan si los datos cambiaron desde que se escribieron', async () => {
    const opciones = [copyDePrueba(), copyDePrueba(), copyDePrueba()]
    const al = (datos_hash: string) => mundo({ promos: [completa({ textos_id: 'tx1' })], textos: [{ id: 'tx1', promocion_id: ID_PROMO, intento: 2, opciones, costo_usd: '0.003', datos_hash, creado_en: 'x' }] })
    const ok = (await leerDetallePromocion(s, ID_PROMO, al(hashDatos(datosDePrueba())).f))!
    expect(ok.textos).toMatchObject({ id: 'tx1', intento: 2, desactualizado: false })
    expect(ok.textos!.opciones).toHaveLength(3)
    const viejo = (await leerDetallePromocion(s, ID_PROMO, al('otro').f))!
    expect(viejo.textos!.desactualizado).toBe(true)
  })

  it('las escenas de la promoción llegan con URLs firmadas y marcan la elegida', async () => {
    const m = mundo({
      promos: [completa()],
      gens: [{ id: 'g1', pieza_raiz_id: null, foto_id: ID_FOTO, edicion: 'promocion', estado: 'ok', motor: 'gemini-nano-banana-2.1', cantidad: 2, costo_estimado_usd: 0.09, costo_real_usd: 0.08, error: null, creado_en: '2026-10-25T12:00:00+00:00', confirmada_en: '2026-10-25T12:01:00+00:00' }],
      creativos: [
        { id: ID_ESCENA, generacion_id: 'g1', pieza_raiz_id: null, foto_id: ID_FOTO, orden: 1, ruta: `${ORGANIZACION_PILOTO_ID}/g1/1.jpg`, ancho: 1024, alto: 1280, costo_usd: 0.04, error: null, elegida: false },
        { id: 'c2', generacion_id: 'g1', pieza_raiz_id: null, foto_id: ID_FOTO, orden: 2, ruta: null, ancho: null, alto: null, costo_usd: 0, error: 'falló', elegida: false },
      ],
    })
    const d = (await leerDetallePromocion(s, ID_PROMO, m.f))!
    expect(d.escenas).toHaveLength(1)
    expect(d.escenas[0]!.generacion).toMatchObject({ id: 'g1', estado: 'ok', costoRealUsd: 0.08 })
    expect(d.escenas[0]!.creativos.map((c) => [c.id, c.esLaElegida, Boolean(c.url)])).toEqual([[ID_ESCENA, true, true], ['c2', false, false]])
    const url = new URL(String(m.f.mock.calls.find(([u]) => new URL(String(u)).pathname === '/rest/v1/generaciones')![0]))
    expect(url.searchParams.get('promocion_id')).toBe(`eq.${ID_PROMO}`)
    expect(url.searchParams.get('estado')).toBe('neq.estimada')
  })

  it('una hija de tanda lee también las escenas de su tanda (or), una suelta solo las suyas', async () => {
    const hija = mundo({ promos: [completa({ tanda_id: 'T1' })] })
    await leerDetallePromocion(s, ID_PROMO, hija.f)
    const u = new URL(String(hija.f.mock.calls.find(([x]) => new URL(String(x)).pathname === '/rest/v1/generaciones')![0]))
    expect(u.searchParams.get('or')).toBe(`(promocion_id.eq.${ID_PROMO},tanda_id.eq.T1)`)
    expect(u.searchParams.has('promocion_id')).toBe(false)
    expect(u.searchParams.get('estado')).toBe('neq.estimada')

    const suelta = mundo({ promos: [completa()] })
    await leerDetallePromocion(s, ID_PROMO, suelta.f)
    const v = new URL(String(suelta.f.mock.calls.find(([x]) => new URL(String(x)).pathname === '/rest/v1/generaciones')![0]))
    expect(v.searchParams.has('or')).toBe(false)
  })

  it('una hija sabe de qué tanda es y cuántas hermanas vivas tiene; una suelta, null', async () => {
    const hija = mundo({ promos: [completa({ tanda_id: 'T1' })] })
    const d = (await leerDetallePromocion(s, ID_PROMO, hija.f))!
    expect(d.tanda).toEqual({ id: 'T1', total: 1 })
    expect((await leerDetallePromocion(s, ID_PROMO, mundo({ promos: [completa()] }).f))!.tanda).toBeNull()
  })

  it('la lista expone el tandaId de cada item', async () => {
    const r = await leerListaPromociones(s, mundo({ promos: [completa({ id: 'a', tanda_id: 'T1' }), completa({ id: 'b' })] }).f)
    expect(r.borradores.map((x) => x.tandaId)).toEqual(['T1', null])
  })

  it('con placa vigente trae la URL para ver y la de descarga con nombre', async () => {
    const m = mundo({ promos: [completa({ placa_ruta: RUTA_PLACA, placa_hash: 'h' })] })
    const d = (await leerDetallePromocion(s, ID_PROMO, m.f))!
    expect(d.placa!.url).toContain(RUTA_PLACA)
    expect(d.placa!.url).not.toContain('download')
    expect(d.placa!.descarga).toMatch(/download=trk-502-4x5\.png/)
  })

  it('las aprobaciones llegan de la más nueva a la más vieja', async () => {
    const m = mundo({
      promos: [completa({ estado: 'aprobada', placa_ruta: RUTA_PLACA, placa_hash: 'h' })],
      aprobaciones: [{ id: 'a2', version: 2, aprobado_en: '2026-10-25T15:00:00+00:00', aprobado_por: 'u' }, { id: 'a1', version: 1, aprobado_en: '2026-10-25T13:00:00+00:00', aprobado_por: 'u' }],
    })
    const d = (await leerDetallePromocion(s, ID_PROMO, m.f))!
    expect(d.aprobaciones.map((a) => a.version)).toEqual([2, 1])
    const url = new URL(String(m.f.mock.calls.find(([u]) => new URL(String(u)).pathname === '/rest/v1/aprobaciones_promocion')![0]))
    expect(url.searchParams.get('order')).toBe('version.desc')
  })

  it('el gasto del mes viene de la base', async () => {
    const d = (await leerDetallePromocion(s, ID_PROMO, mundo({ promos: [completa()], gasto: 1.25 }).f))!
    expect(d.gastadoUsd).toBe(1.25)
  })

  it('nada de lo que sale lleva rutas ni la organización', async () => {
    const m = mundo({ promos: [completa({ placa_ruta: RUTA_PLACA, placa_hash: 'h' })] })
    const d = (await leerDetallePromocion(s, ID_PROMO, m.f))!
    expect(JSON.stringify(d.promocion)).not.toContain(ORGANIZACION_PILOTO_ID)
  })
})

describe('leerFotosParaPromocion', () => {
  it('lista las fotos no borradas con URL firmada', async () => {
    const m = mundo()
    const r = await leerFotosParaPromocion(s, m.f)
    expect(r).toEqual([{ id: ID_FOTO, ancho: 1000, alto: 1200, creadoEn: '2026-10-25T10:00:00+00:00', url: expect.stringContaining(RUTA_FOTO) }])
    const url = new URL(String(m.f.mock.calls[0]![0]))
    expect(url.searchParams.get('borrada_en')).toBe('is.null')
    // Para elegir la moto no se ofrecen las fotos de inspiración.
    expect(url.searchParams.get('uso')).toBe('eq.moto')
    expect(url.searchParams.get('limit')).toBe('20')
  })
})

describe('lotes (ADR-032)', () => {
  it('la lista trae el tipo de la tanda (embed), el grupo y la variante de cada hija', async () => {
    const m = mundo({
      promos: [
        completa({ id: 'a', tanda_id: 'T1', grupo: 2, tandas_promocion: { tipo: 'motos' } }),
        completa({ id: 'b', tanda_id: 'T2', variante: 3, tandas_promocion: { tipo: 'textos' } }),
        completa({ id: 'c', tanda_id: 'T3' }),
        completa({ id: 'd' }),
      ],
    })
    const r = await leerListaPromociones(s, m.f)
    expect(r.borradores.map((x) => [x.tipoTanda, x.grupo, x.variante])).toEqual([
      ['motos', 2, null],
      ['textos', null, 3],
      ['marcas', null, null],
      [null, null, null],
    ])
    const url = new URL(String(m.f.mock.calls[0]![0]))
    expect(url.searchParams.get('select')).toContain('tandas_promocion(tipo)')
  })

  it('el detalle de una hija de un lote de motos ve solo las escenas de SU moto', async () => {
    const gen = (id: string, grupo: number) => ({ id, pieza_raiz_id: null, foto_id: ID_FOTO, edicion: 'promocion', estado: 'ok', motor: 'gemini-nano-banana-2.1', cantidad: 1, costo_estimado_usd: 0.045, costo_real_usd: 0.04, error: null, creado_en: '2026-10-25T12:00:00+00:00', confirmada_en: '2026-10-25T12:01:00+00:00', promocion_id: null, tanda_id: 'T1', grupo })
    const m = mundo({ promos: [completa({ tanda_id: 'T1', grupo: 2 })], gens: [gen('g1', 1), gen('g2', 2)] })
    const d = (await leerDetallePromocion(s, ID_PROMO, m.f))!
    expect(d.escenas.map((e) => e.generacion.id)).toEqual(['g2'])
    expect(d.escenas[0]!.generacion.grupo).toBe(2)
    const url = new URL(String(m.f.mock.calls.find(([u]) => new URL(String(u)).pathname === '/rest/v1/generaciones')![0]))
    expect(url.searchParams.get('select')).toContain('grupo')
  })
})
