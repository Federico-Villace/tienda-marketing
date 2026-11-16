import { describe, it, expect, vi } from 'vitest'
import { HEADER_USUARIO } from '../auth/acceso'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { manejarEstimacion } from './estimacion'
import { promptCopiaFiel, VERSION_PROMPT_COPIA } from '../promocion/copia/prompt'
import { textosCopiaFiel } from '../promocion/copia/textos'
import { hashTextos } from '../promocion/copia/hash-textos'
import { estimarCopiaFiel } from '../promocion/copia/precios'
import { estimarImagenes } from './precios'
import { filaPromocion, ID_FOTO, ID_PROMO } from '../promocion/fixture'
import { MARCAS } from '../datos/marcas'
import { promptAjuste, VERSION_PROMPT_AJUSTE } from './ajuste'

const ID_REF = '88888888-8888-4888-8888-888888888888'
const ID_TANDA = '55555555-5555-4555-8555-555555555555'
const ID_CREATIVO = '66666666-6666-4666-8666-666666666666'
const ID_GEN_BASE = '77777777-7777-4777-8777-777777777777'
const GEN_ID = '44444444-4444-4444-8444-444444444444'
const entorno = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_xyz', GEMINI_API_KEY: 'AIza-SECRETISIMA-1234', PRESUPUESTO_MENSUAL_USD: '10' }
const AHORA = Date.parse('2026-11-18T15:00:00Z')
const PRO = 'gemini-3-pro-image'
const NANO = 'gemini-nano-banana-2.1'

const copia = (o: Record<string, unknown> = {}) =>
  filaPromocion({ id: ID_PROMO, foto_id: ID_FOTO, plantilla: 'copia_fiel', fondo: null, aspecto: '4:5', inspiracion_foto_id: ID_REF, inspiracion_modo: 'diseno', modelo: 'ROUSER 200', titular: 'Tu próxima moto', ...o } as never)
const hija = (i: number, o: Record<string, unknown> = {}) => copia({ id: `hija-${i}`, marca_id: MARCAS[i]!.id, tanda_id: ID_TANDA, ...o })

type Mundo = {
  promo?: Record<string, unknown> | null
  hijas?: ReturnType<typeof hija>[]
  foto?: 'ok' | 'inexistente' | 'borrada'
  ref?: 'ok' | 'inexistente' | 'borrada'
  gastado?: number
  creativo?: Record<string, unknown>
  gen?: Record<string, unknown>
}
function mundo(o: Mundo = {}) {
  const inserts: Record<string, any>[] = []
  const gemini: string[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    if (url.hostname.includes('googleapis')) {
      gemini.push(String(u))
      throw new Error('Gemini no se llama al estimar')
    }
    if (url.pathname === '/rest/v1/miembros') return Response.json([{ rol: 'director' }])
    if (url.pathname === '/rest/v1/promociones') {
      if (url.searchParams.get('tanda_id')) return Response.json(o.hijas ?? [hija(0), hija(2)])
      return Response.json(o.promo === null ? [] : [copia(o.promo ?? {})])
    }
    if (url.pathname === '/rest/v1/fotos') {
      if (url.searchParams.get('id') === `eq.${ID_REF}`) {
        if (o.ref === 'inexistente') return Response.json([])
        return Response.json([{ id: ID_REF, ruta: o.ref === 'borrada' ? null : 'org/ref.jpg', borrada_en: o.ref === 'borrada' ? '2026-11-10T00:00:00Z' : null }])
      }
      if (o.foto === 'inexistente') return Response.json([])
      return Response.json([{ id: ID_FOTO, ruta: o.foto === 'borrada' ? null : 'org/f.jpg', borrada_en: o.foto === 'borrada' ? '2026-11-10T00:00:00Z' : null }])
    }
    if (url.pathname === '/rest/v1/creativos') return Response.json([{ id: ID_CREATIVO, generacion_id: ID_GEN_BASE, ruta: 'org/g/1.jpg', aspecto: '4:5', ...o.creativo }])
    if (url.pathname === '/rest/v1/generaciones' && (init?.method ?? 'GET') === 'GET') {
      return Response.json([{ id: ID_GEN_BASE, foto_id: ID_FOTO, edicion: 'promocion', promocion_id: ID_PROMO, tanda_id: null, grupo: null, pieza_id: null, pieza_raiz_id: null, parametros: {}, ...o.gen }])
    }
    if (url.pathname === '/rest/v1/rpc/gasto_generaciones_mes') return Response.json(o.gastado ?? 0)
    if (url.pathname === '/rest/v1/generaciones' && init?.method === 'POST') {
      const cuerpo = JSON.parse(String(init.body))
      inserts.push(cuerpo)
      return Response.json([{ id: GEN_ID, ...cuerpo }])
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, inserts, gemini }
}
const pedido = (cuerpo: unknown, usuario: string | null = 'u-1') =>
  new Request('https://app.ejemplo.com/api/generaciones', { method: 'POST', headers: { 'content-type': 'application/json', ...(usuario ? { [HEADER_USUARIO]: usuario } : {}) }, body: JSON.stringify(cuerpo) })
const estimar = (m: ReturnType<typeof mundo>, cuerpo: unknown, env: Record<string, string> = entorno) => manejarEstimacion(pedido(cuerpo), env, m.f, () => AHORA)
const okPromo = { promocionId: ID_PROMO, motor: PRO, cantidad: 2 }
const textosDe = (fila = copia()) => textosCopiaFiel(fila, { negocio: MARCAS[3]!.nombre, logoDibujable: false })

describe('copia fiel: estimar la imagen de una promoción', () => {
  it('guarda la generación con el prompt de copia, los textos esperados, su hash y el modelo que verifica; NO llama a Gemini', async () => {
    const m = mundo()
    const r = await estimar(m, okPromo)
    expect(r.status).toBe(201)
    expect(m.gemini).toHaveLength(0)
    const t = textosDe()
    expect(m.inserts[0]).toMatchObject({
      organizacion_id: ORGANIZACION_PILOTO_ID, tipo: 'imagen', motor: PRO, cantidad: 2, aspecto: '4:5', foto_id: ID_FOTO, referencia_foto_id: ID_REF,
      edicion: 'promocion', promocion_id: ID_PROMO, version_prompt: VERSION_PROMPT_COPIA, prompt: promptCopiaFiel({ aspecto: '4:5', textos: t }),
      textos_esperados: t, textos_hash: hashTextos(t), modelo_verificacion: 'gemini-4-argon',
    })
    expect(m.inserts[0]!.vence_en).toBe(new Date(AHORA + 15 * 60_000).toISOString())
  })
  it('el precio es imagen + revisión de textos por variante (Pro, 2 variantes)', async () => {
    const m = mundo()
    const body = await (await estimar(m, okPromo)).json()
    const e = estimarCopiaFiel(PRO, 2, 'gemini-4-argon')
    expect(body.costoEstimadoUsd).toBeCloseTo(e.topeTotalUsd, 6)
    expect(body.costoEstimadoUsd).toBeCloseTo(0.47448, 6)
    expect(m.inserts[0]!.costo_estimado_usd).toBeCloseTo(0.47448, 6)
    expect(body.generacion).toMatchObject({ copiaFiel: true, verificacionUsd: 0.05, cantidad: 2, aspecto: '4:5' })
  })
  it('1 variante Pro = US$ 0,24 y con Nano Banana = US$ 0,10', async () => {
    expect((await (await estimar(mundo(), { ...okPromo, cantidad: 1 })).json()).costoEstimadoUsd).toBeCloseTo(0.23724, 6)
    expect((await (await estimar(mundo(), { ...okPromo, cantidad: 1, motor: NANO })).json()).costoEstimadoUsd).toBeCloseTo(0.09671, 6)
  })
  it('sin motor el modo usa Gemini 3 Pro Image (escribe mejor)', async () => {
    const m = mundo()
    await estimar(m, { promocionId: ID_PROMO, cantidad: 1 })
    expect(m.inserts[0]!.motor).toBe(PRO)
  })
  it('lo que la persona sacó de la placa entra al snapshot y al prompt', async () => {
    const m = mundo({ promo: { diseno: { ocultos: ['precio', 'lugar'] } } })
    await estimar(m, okPromo)
    expect(m.inserts[0]!.textos_esperados).toMatchObject({ precio: null, lugar: null, ocultos: ['precio', 'lugar'] })
    expect(m.inserts[0]!.prompt).toContain('ELEMENTOS SACADOS')
    expect(m.inserts[0]!.prompt).not.toContain('$ 4.500.000')
  })
  it('no exige fondo ni diseño de plantilla: es otra familia', async () => {
    expect((await estimar(mundo({ promo: { fondo: null } }), okPromo)).status).toBe(201)
  })
  it('sin foto de referencia: 422', async () => {
    const m = mundo({ promo: { inspiracion_foto_id: null } })
    const r = await estimar(m, okPromo)
    expect(r.status).toBe(422)
    expect((await r.json()).error).toBe('La copia fiel necesita tu foto de referencia.')
    expect(m.inserts).toHaveLength(0)
  })
  it('referencia inexistente 404, borrada 410; la foto de la moto borrada 410; sin crear nada ni llamar a Gemini', async () => {
    for (const [mu, st] of [[mundo({ ref: 'inexistente' }), 404], [mundo({ ref: 'borrada' }), 410], [mundo({ foto: 'borrada' }), 410], [mundo({ foto: 'inexistente' }), 404]] as const) {
      expect((await estimar(mu, okPromo)).status).toBe(st)
      expect(mu.inserts).toHaveLength(0)
      expect(mu.gemini).toHaveLength(0)
    }
  })
  it('una promoción que no es borrador: 409', async () => {
    expect((await estimar(mundo({ promo: { estado: 'aprobada' } }), okPromo)).status).toBe(409)
  })
  it('un modelo de verificación sin precio es 500 ANTES de insertar', async () => {
    const m = mundo()
    const r = await estimar(m, okPromo, { ...entorno, MODELO_VERIFICACION_TEXTOS: 'modelo-inventado' })
    expect(r.status).toBe(500)
    expect(m.inserts).toHaveLength(0)
  })
  it('un modelo de verificación elegido por entorno se guarda', async () => {
    const m = mundo()
    await estimar(m, okPromo, { ...entorno, MODELO_VERIFICACION_TEXTOS: 'gemini-4-carbon' })
    expect(m.inserts[0]!.modelo_verificacion).toBe('gemini-4-carbon')
  })
  it('el precio sigue siendo el del dato cargado, no el del cliente', async () => {
    const m = mundo()
    await estimar(m, { ...okPromo, precio: '$ 1', textos: { precio: 'gratis' }, costoEstimadoUsd: 1 })
    expect(m.inserts[0]!.textos_esperados.precio).toBe('$ 4.500.000')
    expect(JSON.stringify(m.inserts[0])).not.toContain('gratis')
  })
})

describe('copia fiel: otro formato (generación paga aparte)', () => {
  it('en borrador, con formato distinto: aspecto del formato, prompt en esa proporción y marca formatoExtra', async () => {
    const m = mundo()
    const r = await estimar(m, { ...okPromo, formato: '1:1', cantidad: 1 })
    expect(r.status).toBe(201)
    expect(m.inserts[0]).toMatchObject({ aspecto: '1:1', foto_id: ID_FOTO, referencia_foto_id: ID_REF })
    expect(m.inserts[0]!.prompt).toContain('1:1')
    expect(m.inserts[0]!.parametros).toMatchObject({ formatoExtra: true })
  })
  it('en una promoción APROBADA se permite si el formato es otro', async () => {
    const m = mundo({ promo: { estado: 'aprobada' } })
    expect((await estimar(m, { ...okPromo, formato: '9:16' })).status).toBe(201)
    expect(m.inserts[0]).toMatchObject({ aspecto: '9:16' })
  })
  it('aprobada sin formato, o con el formato de la propia promoción: 409', async () => {
    expect((await estimar(mundo({ promo: { estado: 'aprobada' } }), okPromo)).status).toBe(409)
    expect((await estimar(mundo({ promo: { estado: 'aprobada' } }), { ...okPromo, formato: '4:5' })).status).toBe(409)
  })
  it('el mismo formato que la promoción en borrador no es "extra"', async () => {
    const m = mundo()
    await estimar(m, { ...okPromo, formato: '4:5' })
    expect(m.inserts[0]!.parametros).not.toHaveProperty('formatoExtra')
  })
  it('un formato inválido es 400', async () => {
    expect((await estimar(mundo(), { ...okPromo, formato: '16:9' })).status).toBe(400)
  })
  it('en otra plantilla "formato" es 400 (solo es de la copia fiel)', async () => {
    const m = mundo({ promo: { plantilla: 'impactante_textura', fondo: 'estudio_oscuro', inspiracion_foto_id: null } })
    const r = await estimar(m, { ...okPromo, formato: '1:1' })
    expect(r.status).toBe(400)
    expect(m.inserts).toHaveLength(0)
  })
})

describe('copia fiel en una tanda de marcas', () => {
  const tanda = { tandaId: ID_TANDA, motor: PRO, cantidad: 1 }
  it('textos iguales: UNA generación con los textos de la primera', async () => {
    const m = mundo({ hijas: [hija(0), hija(1)] })
    const r = await estimar(m, tanda)
    expect(r.status).toBe(201)
    expect(m.inserts).toHaveLength(1)
    expect(m.inserts[0]).toMatchObject({ tanda_id: ID_TANDA, version_prompt: VERSION_PROMPT_COPIA, referencia_foto_id: ID_REF })
    expect(m.inserts[0]!.textos_esperados).toBeTruthy()
    expect(m.inserts[0]!.textos_hash).toMatch(/^[0-9a-f]{64}$/)
  })
  it("textos distintos entre las hijas: 422 que dice 'textos de la placa'", async () => {
    const m = mundo({ hijas: [hija(0), hija(1, { diseno: { ocultos: ['precio'] } })] })
    const r = await estimar(m, tanda)
    expect(r.status).toBe(422)
    const b = await r.json()
    expect(b.difieren).toContain('textos de la placa')
    expect(m.inserts).toHaveLength(0)
  })
  it('marcas sin logo dibujable: el nombre del negocio es parte del texto y las separa', async () => {
    const m = mundo({ hijas: [hija(3), hija(4)] }) // Benelli (WebP) y QJ (sin logo)
    const r = await estimar(m, tanda)
    expect(r.status).toBe(422)
    expect((await r.json()).difieren).toContain('textos de la placa')
  })
  it('mezclar copia fiel con otra plantilla es 422', async () => {
    const m = mundo({ hijas: [hija(0), hija(1, { plantilla: 'oferta_abajo', fondo: 'fondo_estudio' })] })
    const r = await estimar(m, tanda)
    expect(r.status).toBe(422)
    expect(m.inserts).toHaveLength(0)
  })
})

describe('copia fiel: un cambio ("Pedile un cambio") hereda los textos', () => {
  const base = { textos_esperados: { modelo: 'ROUSER 200', ocultos: [] }, textos_hash: 'b'.repeat(64), modelo_verificacion: 'gemini-4-argon' }
  it('copia textos_esperados, hash y modelo de la imagen base, y el precio incluye la verificación', async () => {
    const m = mundo({ gen: base })
    const r = await estimar(m, { creativoId: ID_CREATIVO, instruccion: 'más oscuro', promocionId: ID_PROMO, motor: PRO })
    expect(r.status).toBe(201)
    expect(m.inserts[0]).toMatchObject({ ...base, base_creativo_id: ID_CREATIVO, version_prompt: VERSION_PROMPT_AJUSTE })
    const esperado = estimarImagenes(PRO, 1, { imagenesEntrada: 2 }).topeTotalUsd + 0.05
    expect(m.inserts[0]!.costo_estimado_usd).toBeCloseTo(esperado, 6)
    expect((await r.json()).costoEstimadoUsd).toBeCloseTo(esperado, 6)
  })
  it('el prompt suma "no cambies ningún texto" y la versión del prompt de ajuste subió', async () => {
    const m = mundo({ gen: base })
    await estimar(m, { creativoId: ID_CREATIVO, instruccion: 'más oscuro', promocionId: ID_PROMO, motor: PRO })
    expect(m.inserts[0]!.prompt).toMatch(/no cambies ningún texto/i)
    expect(VERSION_PROMPT_AJUSTE).not.toBe('productor-ajuste-v1')
  })
  it('un cambio sobre una imagen que NO es de copia fiel sigue igual: sin textos ni verificación', async () => {
    const m = mundo({ gen: { textos_esperados: null, textos_hash: null, modelo_verificacion: null } })
    await estimar(m, { creativoId: ID_CREATIVO, instruccion: 'más oscuro', promocionId: ID_PROMO, motor: PRO })
    expect(m.inserts[0]).not.toHaveProperty('textos_esperados')
    expect(m.inserts[0]!.prompt).not.toMatch(/ningún texto/i)
    expect(m.inserts[0]!.costo_estimado_usd).toBeCloseTo(estimarImagenes(PRO, 1, { imagenesEntrada: 2 }).topeTotalUsd, 6)
  })
  it('promptAjuste con sinCambiarTextos lo pide explícitamente', () => {
    expect(promptAjuste({ instruccion: 'x', anteriores: [], conFoto: true, composicion: null, aspecto: '4:5', sinCambiarTextos: true })).toMatch(/no cambies ningún texto/i)
    expect(promptAjuste({ instruccion: 'x', anteriores: [], conFoto: true, composicion: null, aspecto: '4:5' })).not.toMatch(/ningún texto/i)
  })
})
