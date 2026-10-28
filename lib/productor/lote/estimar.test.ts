import { describe, it, expect, vi, afterEach } from 'vitest'
import { manejarEstimacionLote } from './estimar'
import { AHORA, entorno, foto, hijaDeLote, ID_LOTE, ID_REF, ID_TANDA, mundo, request, type Mundo } from './mundo-fixture'
import { estimarImagenes } from '../precios'
import { pedidoEscenaDe } from '../../promocion/tanda/escena'
import { promptEscena } from '../../promocion/escena'
import { MARCAS } from '../../datos/marcas'
import { ORGANIZACION_PILOTO_ID } from '../../organizacion'

afterEach(() => vi.restoreAllMocks())

const ok = { tandaId: ID_TANDA, variantes: 1 }
const crearLoteOk = (args: any) =>
  Response.json({
    loteId: ID_LOTE,
    items: (args.p_items as any[]).map((it, i) => ({ generacionId: `g-${i + 1}`, grupo: it.grupo, costoEstimadoUsd: it.costoEstimadoUsd })),
  })
const m0 = (o: Mundo = {}) => mundo({ rpc: { crear_lote_generacion: crearLoteOk }, ...o })
const llamar = (m: ReturnType<typeof mundo>, cuerpo: unknown = ok, e: Record<string, string | undefined> = entorno, usuario: string | null = 'u-1') =>
  manejarEstimacionLote(request('/api/generaciones/lote', cuerpo, usuario), e, m.f, () => AHORA)
const tope = estimarImagenes('gemini-nano-banana-2.1', 1, { conFoto: true }).topeTotalUsd

/** Cada rechazo corta ANTES de crear nada y de tocar a Gemini. */
const sinEfectos = (m: ReturnType<typeof mundo>) => {
  expect(m.rpcs.filter((r) => r.nombre === 'crear_lote_generacion')).toHaveLength(0)
  expect(m.gemini).toHaveLength(0)
}

describe('acceso y apagado (R18: cero llamadas a Gemini)', () => {
  it('sin sesión 401', async () => {
    const m = m0()
    expect((await llamar(m, ok, entorno, null)).status).toBe(401)
    sinEfectos(m)
  })
  it('lector 403, y un usuario que no es miembro también', async () => {
    for (const rol of ['lector', null]) {
      const m = m0({ rol })
      expect((await llamar(m)).status).toBe(403)
      sinEfectos(m)
    }
  })
  it('el operador actúa', async () => {
    expect((await llamar(m0({ rol: 'operador' }))).status).toBe(201)
  })
  it('sin GEMINI_API_KEY o sin tope mensual válido: 503', async () => {
    for (const e of [{ ...entorno, GEMINI_API_KEY: '' }, { ...entorno, PRESUPUESTO_MENSUAL_USD: '' }, { ...entorno, PRESUPUESTO_MENSUAL_USD: 'abc' }]) {
      const m = m0()
      expect((await llamar(m, ok, e)).status).toBe(503)
      sinEfectos(m)
    }
  })
})

describe('el pedido (400)', () => {
  it.each([
    ['sin tanda', {}],
    ['tanda inválida', { tandaId: 'abc', variantes: 1 }],
    ['sin variantes', { tandaId: ID_TANDA }],
    ['variantes 0, 3 o decimal', { ...ok, variantes: 3 }],
    ['motor desconocido', { ...ok, motor: 'inventado' }],
    ['grupos que no es una lista de enteros 1..10', { ...ok, grupos: ['uno'] }],
    ['grupos vacía', { ...ok, grupos: [] }],
    ['body que no es un objeto', []],
  ])('%s', async (_n, cuerpo) => {
    const m = m0()
    expect((await llamar(m, cuerpo)).status).toBe(400)
    sinEfectos(m)
  })
  it('variantes 0 también', async () => {
    const m = m0()
    expect((await llamar(m, { ...ok, variantes: 0 })).status).toBe(400)
    sinEfectos(m)
  })
})

describe('la tanda', () => {
  it('inexistente 404; si no es un lote de motos, 422', async () => {
    const a = m0({ tipo: null })
    expect((await llamar(a)).status).toBe(404)
    for (const tipo of ['marcas', 'textos']) {
      const m = m0({ tipo })
      const r = await llamar(m)
      expect(r.status).toBe(422)
      expect(((await r.json()) as any).error).toMatch(/lote de motos/)
      sinEfectos(m)
    }
    sinEfectos(a)
  })
  it('sin hijas vivas: 404', async () => {
    const m = m0({ hijas: [hijaDeLote(1, 3, { estado: 'descartada' })] })
    expect((await llamar(m)).status).toBe(404)
    sinEfectos(m)
  })
  it('alguna hija que ya no es borrador: 409', async () => {
    const m = m0({ hijas: [hijaDeLote(1, 3), hijaDeLote(2, 3, { estado: 'aprobada' })] })
    expect((await llamar(m)).status).toBe(409)
    sinEfectos(m)
  })
  it('lee las hijas SOLO de la organización y de esa tanda', async () => {
    const m = m0()
    await llamar(m)
    const u = new URL(String(m.f.mock.calls.find(([x]) => new URL(String(x)).pathname === '/rest/v1/promociones')![0]))
    expect(u.searchParams.get('tanda_id')).toBe(`eq.${ID_TANDA}`)
    expect(u.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
  })
})

describe('validación por moto (422 con la moto en el mensaje)', () => {
  it('una moto sin diseño o sin fondo elegido', async () => {
    const m = m0({ hijas: [hijaDeLote(1, 3), hijaDeLote(2, 3, { plantilla: null })] })
    const r = await llamar(m)
    expect(r.status).toBe(422)
    const b = (await r.json()) as any
    expect(b.error).toContain('Moto 2')
    expect(b.error).toContain('Elegí un diseño')
    expect(b.grupo).toBe(2)
    sinEfectos(m)
    const sinFondo = m0({ hijas: [hijaDeLote(1, 3, { fondo: null })] })
    expect((await llamar(sinFondo)).status).toBe(422)
  })
  it('texto al costado con la moto al centro', async () => {
    const m = m0({ hijas: [hijaDeLote(1, 3, { plantilla: 'oferta_costado', posicion_moto: 'centro' })] })
    const r = await llamar(m)
    expect(r.status).toBe(422)
    expect(((await r.json()) as any).error).toContain('Moto 1')
    sinEfectos(m)
  })
  it('"solo mi descripción" sin descripción ni inspiración', async () => {
    const m = m0({ hijas: [hijaDeLote(1, 3, { fondo: 'solo_descripcion', fondo_descripcion: null })] })
    expect((await llamar(m)).status).toBe(422)
    sinEfectos(m)
  })
  it('dentro de UNA moto las marcas deben pedir la misma escena (y dice cuál difiere)', async () => {
    const m = m0({ hijas: [hijaDeLote(1, 3), hijaDeLote(1, 5, { fondo: 'escenario_ruta' }), hijaDeLote(2, 3)] })
    const r = await llamar(m)
    expect(r.status).toBe(422)
    const b = (await r.json()) as any
    expect(b.difieren).toEqual(['fondo'])
    expect(b.grupo).toBe(1)
    sinEfectos(m)
  })
  it('entre motos distintas SÍ pueden diferir foto, fondo y diseño', async () => {
    const m = m0({ hijas: [hijaDeLote(1, 3), hijaDeLote(2, 3, { fondo: 'escenario_ruta', plantilla: 'catalogo_arriba' })] })
    expect((await llamar(m)).status).toBe(201)
  })
  it('una hija sin grupo no es de un lote de motos: 422', async () => {
    const m = m0({ hijas: [hijaDeLote(1, 3, { grupo: null })] })
    expect((await llamar(m)).status).toBe(422)
    sinEfectos(m)
  })
})

describe('las fotos', () => {
  it('una foto inexistente es 404 y una borrada 410', async () => {
    const a = m0({ fotos: { faltan: [foto(2)] } })
    expect((await llamar(a)).status).toBe(404)
    const b = m0({ fotos: { borradas: [foto(3)] } })
    expect((await llamar(b)).status).toBe(410)
    sinEfectos(a)
    sinEfectos(b)
  })
  it('la foto de inspiración inexistente 404 y borrada 410', async () => {
    const hijas = [hijaDeLote(1, 3, { inspiracion_foto_id: ID_REF })]
    const a = m0({ hijas, ref: 'inexistente' })
    expect((await llamar(a)).status).toBe(404)
    const b = m0({ hijas, ref: 'borrada' })
    expect((await llamar(b)).status).toBe(410)
    sinEfectos(a)
    sinEfectos(b)
  })
})

describe('el lote estimado (201)', () => {
  it('una imagen por moto con SU prompt, su foto y su grupo; el total es la suma de los topes', async () => {
    const hijas = [hijaDeLote(1, 3), hijaDeLote(1, 5), hijaDeLote(2, 3, { fondo: 'escenario_urbano', plantilla: 'catalogo_arriba' }), hijaDeLote(2, 5, { fondo: 'escenario_urbano', plantilla: 'catalogo_arriba' })]
    const m = m0({ hijas, gastado: 1.5 })
    const r = await llamar(m, { ...ok, variantes: 2 })
    expect(r.status).toBe(201)
    const { args } = m.rpcs.find((x) => x.nombre === 'crear_lote_generacion')!
    expect(args).toMatchObject({ p_org: ORGANIZACION_PILOTO_ID, p_tanda: ID_TANDA, p_promocion: null, p_usuario: 'u-1' })
    expect(args.p_vence).toBe(new Date(AHORA + 15 * 60_000).toISOString())
    expect(args.p_items).toHaveLength(2)
    const por2 = estimarImagenes('gemini-nano-banana-2.1', 2, { conFoto: true }).topeTotalUsd
    expect(args.p_items[0]).toMatchObject({
      motor: 'gemini-nano-banana-2.1',
      cantidad: 2,
      aspecto: '4:5',
      fotoId: foto(1),
      grupo: 1,
      versionPrompt: 'promocion-escena-v3',
      costoEstimadoUsd: por2,
      prompt: promptEscena(pedidoEscenaDe(hijas[0] as never)),
    })
    expect(args.p_items[1]).toMatchObject({ fotoId: foto(2), grupo: 2, prompt: promptEscena(pedidoEscenaDe(hijas[2] as never)) })
    expect(args.p_items[0].parametros).toMatchObject({ aspecto: '4:5', image_size: '1K', escena: { fondo: 'fondo_estudio', conInspiracion: false } })
    const b = (await r.json()) as any
    expect(b.lote.id).toBe(ID_LOTE)
    expect(b.lote.costoEstimadoUsd).toBeCloseTo(por2 * 2, 6)
    expect(b.lote.items).toEqual([
      { generacionId: 'g-1', grupo: 1, modelo: 'Moto 1', costoEstimadoUsd: por2 },
      { generacionId: 'g-2', grupo: 2, modelo: 'Moto 2', costoEstimadoUsd: por2 },
    ])
    expect(b.lote.venceEn).toBe(new Date(AHORA + 15 * 60_000).toISOString())
    expect(b.mes).toEqual({ gastadoUsd: 1.5, topeUsd: 10 })
    expect(b.excedeTope).toBe(false)
  })

  it('el costo es el de las imágenes de TODAS las motos: 5 motos × 1 variante ≈ US$ 0,23', async () => {
    const m = m0({ hijas: [1, 2, 3, 4, 5].map((g) => hijaDeLote(g, 3)) })
    const b = (await (await llamar(m)).json()) as any
    expect(b.lote.items).toHaveLength(5)
    expect(b.lote.costoEstimadoUsd).toBeCloseTo(5 * tope, 6)
    expect(b.lote.costoEstimadoUsd).toBeGreaterThan(0.22)
    expect(b.lote.costoEstimadoUsd).toBeLessThan(0.24)
  })

  it('con foto de inspiración cada imagen la lleva como segunda entrada (cuesta algo más) y se guarda', async () => {
    const m = m0({ hijas: [hijaDeLote(1, 3, { inspiracion_foto_id: ID_REF })], ref: 'ok' })
    await llamar(m)
    const it0 = m.rpcs.find((x) => x.nombre === 'crear_lote_generacion')!.args.p_items[0]
    expect(it0.referenciaFotoId).toBe(ID_REF)
    expect(it0.costoEstimadoUsd).toBe(estimarImagenes('gemini-nano-banana-2.1', 1, { conFoto: true, conReferencia: true }).topeTotalUsd)
    expect(it0.parametros.escena.conInspiracion).toBe(true)
  })

  it('"grupos" estima solo esas motos (reintento de las fallidas)', async () => {
    const m = m0({ hijas: [1, 2, 3].map((g) => hijaDeLote(g, 3)) })
    const r = await llamar(m, { ...ok, grupos: [2, 3] })
    expect(r.status).toBe(201)
    expect(m.rpcs.find((x) => x.nombre === 'crear_lote_generacion')!.args.p_items.map((i: any) => i.grupo)).toEqual([2, 3])
    const mala = m0()
    expect((await llamar(mala, { ...ok, grupos: [9] })).status).toBe(404)
    sinEfectos(mala)
  })

  it('las hijas descartadas no cuentan (una moto con todas descartadas no entra)', async () => {
    const m = m0({ hijas: [hijaDeLote(1, 3), hijaDeLote(2, 3, { estado: 'descartada' })] })
    await llamar(m)
    expect(m.rpcs[0]!.args.p_items.map((i: any) => i.grupo)).toEqual([1])
  })

  it('excedeTope avisa si el lote no entra en lo que queda del mes (igual se estima: no cuesta)', async () => {
    const m = m0({ gastado: 9.9 })
    expect(((await (await llamar(m)).json()) as any).excedeTope).toBe(true)
  })

  it('ignora cualquier precio, tope o costo que mande el cliente', async () => {
    const m = m0()
    await llamar(m, { ...ok, costoEstimadoUsd: 0.0001, topeUsd: 999, p_items: [], items: [] })
    const total = m.rpcs[0]!.args.p_items.reduce((t: number, i: any) => t + i.costoEstimadoUsd, 0)
    expect(total).toBeCloseTo(3 * tope, 6)
  })

  it('no llama a Gemini (solo estima)', async () => {
    const m = m0()
    await llamar(m)
    expect(m.gemini).toHaveLength(0)
    for (const [u] of m.f.mock.calls) expect(new URL(String(u)).hostname).toBe('abc.supabase.co')
  })
})

describe('errores de la RPC', () => {
  it('PT404 → 404, 22023 → 400, otro → 500 sin filtrar detalles', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const con = (status: number) => m0({ rpc: { crear_lote_generacion: () => new Response(JSON.stringify({ message: 'boom interno' }), { status }) } })
    expect((await llamar(con(404))).status).toBe(404)
    expect((await llamar(con(400))).status).toBe(400)
    const r = await llamar(con(500))
    expect(r.status).toBe(500)
    expect(await r.text()).not.toContain('boom')
  })
})

describe('marcas', () => {
  it('el modelo que ve la pantalla sale de la hija', async () => {
    const m = m0({ hijas: [hijaDeLote(1, 5, { modelo: 'Leoncino 500' })] })
    const b = (await (await llamar(m)).json()) as any
    expect(b.lote.items[0].modelo).toBe('Leoncino 500')
    expect(MARCAS[5]).toBeDefined()
  })
})
