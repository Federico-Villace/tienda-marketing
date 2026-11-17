import { describe, it, expect, vi, afterEach } from 'vitest'
import { manejarEstimacionLote } from './estimar'
import { AHORA, entorno, foto, ID_LOTE, ID_REF, ID_TANDA, mundo, request, type Mundo } from './mundo-fixture'
import { MARCAS } from '../../datos/marcas'
import { ORGANIZACION_PILOTO_ID } from '../../organizacion'
import { filaPromocion } from '../../promocion/fixture'
import { hashTextos } from '../../promocion/copia/hash-textos'
import { estimarCopiaFiel } from '../../promocion/copia/precios'
import { promptCopiaFiel, VERSION_PROMPT_COPIA } from '../../promocion/copia/prompt'
import { textosCopiaFiel } from '../../promocion/copia/textos'
import { logoDibujable } from '../../promocion/copia/logo'
import { leerManifiesto } from '../../promocion/logos-servidor'

afterEach(() => vi.restoreAllMocks())

const PRO = 'gemini-3-pro-image'
const NANO = 'gemini-nano-banana-2.1'
const MODELO_VERIF = 'gemini-4-argon'

/** Una pieza de copia fiel: `grupo` (moto de un lote de motos), `variante` (texto de un lote de textos) o ninguno (tanda de marcas). */
const pieza = (id: string, marca: number, o: Record<string, unknown> = {}) =>
  filaPromocion({
    id,
    marca_id: MARCAS[marca]!.id,
    modelo: 'ROUSER 200',
    tanda_id: ID_TANDA,
    grupo: null,
    foto_id: foto(1),
    plantilla: 'copia_fiel',
    fondo: null,
    aspecto: '4:5',
    inspiracion_foto_id: ID_REF,
    inspiracion_modo: 'diseno',
    titular: 'Tu próxima moto',
    ...o,
  } as never)
const marcaDe = (id: string, marca: number, o: Record<string, unknown> = {}) => pieza(id, marca, o)
const motoDe = (grupo: number, marca: number, o: Record<string, unknown> = {}) => pieza(`h${grupo}-${marca}`, marca, { grupo, foto_id: foto(grupo), modelo: `Moto ${grupo}`, ...o })
const textoDe = (variante: number, o: Record<string, unknown> = {}) => pieza(`t${variante}`, 0, { variante, titular: `Frase ${variante}`, ...o })
const textosDe = (fila: ReturnType<typeof pieza>) =>
  textosCopiaFiel(fila, { negocio: MARCAS.find((m) => m.id === fila.marca_id)!.nombre, logoDibujable: logoDibujable(leerManifiesto(), fila.marca_id) })

/** El RPC devuelve los ítems en CUALQUIER orden (el id es aleatorio): el backend los reconoce por su hash. */
const crearLote = (invertir = false) => (args: any) => {
  const items = (args.p_items as any[]).map((it, i) => ({ generacionId: `g-${i + 1}`, grupo: it.grupo, costoEstimadoUsd: it.costoEstimadoUsd, textosHash: it.textosHash }))
  return Response.json({ loteId: ID_LOTE, items: invertir ? [...items].reverse() : items })
}
const m0 = (o: Mundo = {}) => mundo({ tipo: 'marcas', rpc: { crear_lote_generacion: crearLote() }, ...o })
const llamar = (m: ReturnType<typeof mundo>, cuerpo: unknown = { tandaId: ID_TANDA, variantes: 1 }, e: Record<string, string | undefined> = entorno, usuario: string | null = 'u-1') =>
  manejarEstimacionLote(request('/api/generaciones/lote', cuerpo, usuario), e, m.f, () => AHORA)
const crear = (m: ReturnType<typeof mundo>) => m.rpcs.filter((r) => r.nombre === 'crear_lote_generacion')
const sinEfectos = (m: ReturnType<typeof mundo>) => {
  expect(crear(m)).toHaveLength(0)
  expect(m.gemini).toHaveLength(0)
}
const porItem = (variantes = 1, motor = PRO) => estimarCopiaFiel(motor, variantes, MODELO_VERIF, 2).topeTotalUsd

describe('copia fiel en una tanda de marcas (una moto, una pieza por concesionaria)', () => {
  it('marcas con los mismos textos: UNA imagen para todas, con sus textos esperados, su hash y el modelo que revisa', async () => {
    const hijas = [marcaDe('a', 0), marcaDe('b', 1)]
    const m = m0({ hijas })
    const r = await llamar(m)
    expect(r.status).toBe(201)
    const { args } = crear(m)[0]!
    expect(args).toMatchObject({ p_org: ORGANIZACION_PILOTO_ID, p_tanda: ID_TANDA, p_promocion: null, p_usuario: 'u-1' })
    expect(args.p_items).toHaveLength(1)
    const t = textosDe(hijas[0]!)
    expect(args.p_items[0]).toMatchObject({
      motor: PRO,
      cantidad: 1,
      aspecto: '4:5',
      fotoId: foto(1),
      referenciaFotoId: ID_REF,
      versionPrompt: VERSION_PROMPT_COPIA,
      prompt: promptCopiaFiel({ aspecto: '4:5', textos: t }),
      textosEsperados: t,
      textosHash: hashTextos(t),
      modeloVerificacion: MODELO_VERIF,
      costoEstimadoUsd: porItem(),
    })
    expect(args.p_items[0].grupo ?? null).toBeNull()
    expect(m.gemini).toHaveLength(0)
  })

  it('el total es imágenes + revisión de textos, y la pantalla recibe a qué piezas sirve cada imagen', async () => {
    const m = m0({ hijas: [marcaDe('a', 0), marcaDe('b', 1)] })
    const b = (await (await llamar(m)).json()) as any
    expect(b.lote.id).toBe(ID_LOTE)
    expect(b.lote.copiaFiel).toBe(true)
    expect(b.lote.costoEstimadoUsd).toBeCloseTo(porItem(), 6)
    expect(b.lote.items).toEqual([{ generacionId: 'g-1', grupo: null, modelo: 'ROUSER 200', costoEstimadoUsd: porItem(), copiaFiel: true, verificacionUsd: 0.05, hijaIds: ['a', 'b'] }])
    expect(b.lote.venceEn).toBe(new Date(AHORA + 15 * 60_000).toISOString())
  })

  it('sin pedir motor usa Gemini 3 Pro Image (escribe mejor); si la persona eligió Nano Banana, ese manda', async () => {
    const a = m0({ hijas: [marcaDe('a', 0)] })
    await llamar(a)
    expect(crear(a)[0]!.args.p_items[0].motor).toBe(PRO)
    const b = m0({ hijas: [marcaDe('a', 0)] })
    await llamar(b, { tandaId: ID_TANDA, variantes: 1, motor: NANO })
    expect(crear(b)[0]!.args.p_items[0]).toMatchObject({ motor: NANO, costoEstimadoUsd: porItem(1, NANO) })
  })

  it('con 2 variantes cada imagen se pide dos veces y se revisan las dos', async () => {
    const m = m0({ hijas: [marcaDe('a', 0), marcaDe('b', 1)] })
    const b = (await (await llamar(m, { tandaId: ID_TANDA, variantes: 2 })).json()) as any
    expect(crear(m)[0]!.args.p_items[0]).toMatchObject({ cantidad: 2, costoEstimadoUsd: porItem(2) })
    expect(b.lote.items[0].verificacionUsd).toBeCloseTo(0.1, 6)
    expect(b.lote.costoEstimadoUsd).toBeCloseTo(porItem(2), 6)
  })

  it('textos distintos entre las marcas (sin logo dibujable el nombre del negocio se escribe): UNA imagen por juego de textos, todo en un lote y un solo total', async () => {
    const hijas = [marcaDe('a', 0), marcaDe('b', 1), marcaDe('c', 3), marcaDe('d', 4)]
    const m = m0({ hijas, rpc: { crear_lote_generacion: crearLote(true) } })
    const r = await llamar(m)
    expect(r.status).toBe(201)
    const items = crear(m)[0]!.args.p_items as any[]
    expect(items).toHaveLength(3)
    expect(new Set(items.map((i) => i.textosHash)).size).toBe(3)
    const b = (await r.json()) as any
    expect(b.lote.costoEstimadoUsd).toBeCloseTo(3 * porItem(), 6)
    // Cada ítem de la respuesta lleva SUS piezas, aunque la base los devuelva en otro orden.
    expect(b.lote.items.map((i: any) => i.hijaIds)).toEqual([['a', 'b'], ['c'], ['d']])
    expect(b.lote.items.map((i: any) => i.generacionId)).toEqual(['g-1', 'g-2', 'g-3'])
  })

  it('lo que la persona sacó de la placa (diseno.ocultos) vale para todas y entra al snapshot y al prompt', async () => {
    const hijas = [marcaDe('a', 0, { diseno: { ocultos: ['precio'] } }), marcaDe('b', 1, { diseno: { ocultos: ['precio'] } })]
    const m = m0({ hijas })
    await llamar(m)
    const it0 = crear(m)[0]!.args.p_items[0]
    expect(it0.textosEsperados).toMatchObject({ precio: null, ocultos: ['precio'] })
    expect(it0.prompt).not.toContain('$ 4.500.000')
  })

  it('el fondo, su descripción y la posición del texto NO frenan la copia fiel (no entran al pedido)', async () => {
    const m = m0({ hijas: [marcaDe('a', 0, { fondo: 'fondo_estudio', fondo_descripcion: 'x', posicion_moto: 'izquierda' }), marcaDe('b', 1, { fondo: null, fondo_descripcion: null, posicion_moto: 'centro' })] })
    expect((await llamar(m)).status).toBe(201)
  })
})

describe('copia fiel en un lote de textos (la misma moto, 2 a 5 textos)', () => {
  it('una imagen por texto, cada una con SUS textos esperados', async () => {
    const hijas = [textoDe(1), textoDe(2), textoDe(3)]
    const m = m0({ tipo: 'textos', hijas })
    const r = await llamar(m)
    expect(r.status).toBe(201)
    const items = crear(m)[0]!.args.p_items as any[]
    expect(items).toHaveLength(3)
    items.forEach((it, i) => {
      expect(it.textosHash).toBe(hashTextos(textosDe(hijas[i]!)))
      expect(it.textosEsperados.frase).toBe(`Frase ${i + 1}`)
      expect(it.fotoId).toBe(foto(1))
    })
    const b = (await r.json()) as any
    expect(b.lote.costoEstimadoUsd).toBeCloseTo(3 * porItem(), 6)
    expect(b.lote.items.map((i: any) => i.hijaIds)).toEqual([['t1'], ['t2'], ['t3']])
  })
})

describe('copia fiel en un lote de motos (varias motos, el mismo diseño)', () => {
  it('una imagen por moto con SU foto y su grupo, y por juego de textos dentro de cada moto', async () => {
    const hijas = [motoDe(1, 0), motoDe(1, 1), motoDe(2, 0), motoDe(2, 3)]
    const m = m0({ tipo: 'motos', hijas })
    const r = await llamar(m)
    expect(r.status).toBe(201)
    const items = crear(m)[0]!.args.p_items as any[]
    expect(items.map((i) => [i.grupo, i.fotoId])).toEqual([[1, foto(1)], [2, foto(2)], [2, foto(2)]])
    const b = (await r.json()) as any
    expect(b.lote.items.map((i: any) => [i.grupo, i.modelo, i.hijaIds])).toEqual([[1, 'Moto 1', ['h1-0', 'h1-1']], [2, 'Moto 2', ['h2-0']], [2, 'Moto 2', ['h2-3']]])
    expect(b.lote.costoEstimadoUsd).toBeCloseTo(3 * porItem(), 6)
  })

  it('cada moto puede tener su propia referencia', async () => {
    const otra = '99999999-9999-4999-8999-999999999992'
    const m = m0({ tipo: 'motos', hijas: [motoDe(1, 0), motoDe(2, 0, { inspiracion_foto_id: otra })] })
    await llamar(m)
    expect(crear(m)[0]!.args.p_items.map((i: any) => i.referenciaFotoId)).toEqual([ID_REF, otra])
  })

  it('"grupos" estima solo esas motos', async () => {
    const m = m0({ tipo: 'motos', hijas: [motoDe(1, 0), motoDe(2, 0), motoDe(3, 0)] })
    const r = await llamar(m, { tandaId: ID_TANDA, variantes: 1, grupos: [2, 3] })
    expect(r.status).toBe(201)
    expect(crear(m)[0]!.args.p_items.map((i: any) => i.grupo)).toEqual([2, 3])
  })

  it('una moto con copia fiel y otra con una plantilla de siempre no se estiman juntas: 422 con la moto', async () => {
    const m = m0({ tipo: 'motos', hijas: [motoDe(1, 0), motoDe(2, 0, { plantilla: 'oferta_abajo', fondo: 'fondo_estudio', inspiracion_foto_id: null })] })
    const r = await llamar(m)
    expect(r.status).toBe(422)
    expect(((await r.json()) as any).error).toMatch(/copia fiel/)
    sinEfectos(m)
  })
})

describe('rechazos (todos cortan ANTES de crear el lote y de tocar a Gemini)', () => {
  it('lector 403 y sin sesión 401', async () => {
    const a = m0({ hijas: [marcaDe('a', 0)], rol: 'lector' })
    expect((await llamar(a)).status).toBe(403)
    sinEfectos(a)
    const b = m0({ hijas: [marcaDe('a', 0)] })
    expect((await llamar(b, undefined, entorno, null)).status).toBe(401)
    sinEfectos(b)
  })

  it('una tanda de marcas o de textos que NO es de copia fiel sigue pidiendo "Ver precio de la tanda"', async () => {
    for (const tipo of ['marcas', 'textos']) {
      const m = m0({ tipo, hijas: [marcaDe('a', 0, { plantilla: 'oferta_abajo', fondo: 'fondo_estudio', inspiracion_foto_id: null })] })
      const r = await llamar(m)
      expect(r.status).toBe(422)
      expect(((await r.json()) as any).error).toMatch(/lote de motos/)
      sinEfectos(m)
    }
  })

  it('mezclar copia fiel con otra plantilla en la misma tanda es 422', async () => {
    const m = m0({ hijas: [marcaDe('a', 0), marcaDe('b', 1, { plantilla: 'oferta_abajo', fondo: 'fondo_estudio', inspiracion_foto_id: null })] })
    const r = await llamar(m)
    expect(r.status).toBe(422)
    expect(((await r.json()) as any).error).toMatch(/copia fiel/)
    sinEfectos(m)
  })

  it('sin foto de referencia: 422', async () => {
    const m = m0({ hijas: [marcaDe('a', 0, { inspiracion_foto_id: null })] })
    const r = await llamar(m)
    expect(r.status).toBe(422)
    expect(((await r.json()) as any).error).toBe('La copia fiel necesita tu foto de referencia.')
    sinEfectos(m)
  })

  it('piezas que no piden la misma foto, formato o referencia: 422 que dice cuál difiere', async () => {
    for (const [o, campo] of [[{ foto_id: foto(9) }, 'foto'], [{ aspecto: '1:1' }, 'formato'], [{ inspiracion_foto_id: '99999999-9999-4999-8999-999999999993' }, 'foto de inspiración']] as const) {
      const m = m0({ hijas: [marcaDe('a', 0), marcaDe('b', 1, o)] })
      const r = await llamar(m)
      expect(r.status).toBe(422)
      expect(((await r.json()) as any).difieren).toEqual([campo])
      sinEfectos(m)
    }
  })

  it('referencia inexistente 404, borrada 410; la foto de la moto inexistente 404, borrada 410', async () => {
    for (const [o, st] of [[{ ref: 'inexistente' }, 404], [{ ref: 'borrada' }, 410], [{ fotos: { faltan: [foto(1)] } }, 404], [{ fotos: { borradas: [foto(1)] } }, 410]] as const) {
      const m = m0({ hijas: [marcaDe('a', 0)], ...(o as Mundo) })
      expect((await llamar(m)).status).toBe(st)
      sinEfectos(m)
    }
  })

  it('alguna pieza que ya no es borrador: 409', async () => {
    const m = m0({ hijas: [marcaDe('a', 0), marcaDe('b', 1, { estado: 'aprobada' })] })
    expect((await llamar(m)).status).toBe(409)
    sinEfectos(m)
  })

  it('el modelo que revisa los textos sin precio cargado es 500 ANTES de crear nada', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = m0({ hijas: [marcaDe('a', 0)] })
    const r = await llamar(m, undefined, { ...entorno, MODELO_VERIFICACION_TEXTOS: 'modelo-inventado' })
    expect(r.status).toBe(500)
    sinEfectos(m)
  })

  it('más de 10 imágenes en un pedido: 422 que sugiere hacerlo por partes', async () => {
    // 5 motos × 3 juegos de textos (999, Benelli y QJ) = 15 imágenes.
    const hijas = [1, 2, 3, 4, 5].flatMap((g) => [motoDe(g, 0), motoDe(g, 3), motoDe(g, 4)])
    const m = m0({ tipo: 'motos', hijas })
    const r = await llamar(m)
    expect(r.status).toBe(422)
    expect(((await r.json()) as any).error).toMatch(/10/)
    sinEfectos(m)
  })

  it('ignora cualquier precio, textos o tope que mande el cliente', async () => {
    const m = m0({ hijas: [marcaDe('a', 0)] })
    await llamar(m, { tandaId: ID_TANDA, variantes: 1, costoEstimadoUsd: 0.0001, textosEsperados: { modelo: 'ROBADO' }, topeUsd: 999, items: [] })
    const it0 = crear(m)[0]!.args.p_items[0]
    expect(it0.costoEstimadoUsd).toBeCloseTo(porItem(), 6)
    expect(it0.textosEsperados.modelo).toBe('ROUSER 200')
  })

  it('PT404 de la base es 404 y un error de la base no filtra detalles', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const con = (status: number) => m0({ hijas: [marcaDe('a', 0)], rpc: { crear_lote_generacion: () => new Response(JSON.stringify({ message: 'boom interno' }), { status }) } })
    expect((await llamar(con(404))).status).toBe(404)
    const r = await llamar(con(500))
    expect(r.status).toBe(500)
    expect(await r.text()).not.toContain('boom')
  })

  it('si la base no devuelve alguno de los ítems: 500 (no se muestra un total que no coincide)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = m0({ hijas: [marcaDe('a', 0), marcaDe('b', 3)], rpc: { crear_lote_generacion: () => Response.json({ loteId: ID_LOTE, items: [{ generacionId: 'g-1', grupo: null, costoEstimadoUsd: 0.2, textosHash: 'x'.repeat(64) }] }) } })
    expect((await llamar(m)).status).toBe(500)
  })
})
