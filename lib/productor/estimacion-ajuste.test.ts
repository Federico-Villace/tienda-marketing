import { describe, it, expect, vi } from 'vitest'
import { HEADER_USUARIO } from '../auth/acceso'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { manejarEstimacion, leerOrigen } from './estimacion'
import { anterioresDe, promptAjuste, VERSION_PROMPT_AJUSTE } from './ajuste'
import { estimarImagenes } from './precios'
import { composicion } from '../promocion/escena'
import { filaPromocion, ID_FOTO, ID_PROMO } from '../promocion/fixture'

const ID_CREATIVO = '55555555-5555-4555-8555-555555555555'
const ID_GEN_BASE = '66666666-6666-4666-8666-666666666666'
const ID_TANDA = '77777777-7777-4777-8777-777777777777'
const ID_PIEZA = '88888888-8888-4888-8888-888888888888'
const ID_RAIZ = '99999999-9999-4999-8999-999999999999'
const GEN_ID = '44444444-4444-4444-8444-444444444444'
const entorno = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_xyz',
  GEMINI_API_KEY: 'AIza-SECRETISIMA-1234',
  PRESUPUESTO_MENSUAL_USD: '10',
}
const AHORA = Date.parse('2026-10-26T15:00:00Z')

const genFoto = { id: ID_GEN_BASE, foto_id: ID_FOTO, edicion: 'fondo_estudio', pieza_id: null, pieza_raiz_id: null, promocion_id: null, tanda_id: null, grupo: null, parametros: {} }
const genPromo = { ...genFoto, edicion: 'promocion', promocion_id: ID_PROMO }
const genPieza = { ...genFoto, foto_id: null, edicion: null, pieza_id: ID_PIEZA, pieza_raiz_id: ID_RAIZ }

type Mundo = {
  rol?: string
  creativo?: Record<string, unknown> | null
  gen?: Record<string, unknown> | null
  promo?: Record<string, unknown> | null
  foto?: 'ok' | 'borrada'
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
    if (url.pathname === '/rest/v1/miembros') return Response.json([{ rol: o.rol ?? 'director' }])
    if (url.pathname === '/rest/v1/creativos')
      return Response.json(o.creativo === null ? [] : [{ id: ID_CREATIVO, generacion_id: ID_GEN_BASE, ruta: 'org/g/1.jpg', aspecto: '4:5', ...o.creativo }])
    if (url.pathname === '/rest/v1/generaciones' && (init?.method ?? 'GET') === 'GET') return Response.json(o.gen === null ? [] : [o.gen ?? genFoto])
    if (url.pathname === '/rest/v1/promociones')
      return Response.json(o.promo === null ? [] : [{ ...filaPromocion({ id: ID_PROMO, plantilla: 'oferta_abajo', aspecto: '4:5' } as never), ...o.promo }])
    if (url.pathname === '/rest/v1/fotos')
      return Response.json([{ id: ID_FOTO, ruta: o.foto === 'borrada' ? null : 'org/f.jpg', borrada_en: o.foto === 'borrada' ? '2026-10-20T00:00:00Z' : null }])
    if (url.pathname === '/rest/v1/rpc/gasto_generaciones_mes') return Response.json(0)
    if (url.pathname === '/rest/v1/generaciones' && init?.method === 'POST') {
      const cuerpo = JSON.parse(String(init.body))
      inserts.push(cuerpo)
      return Response.json([{ id: GEN_ID, ...cuerpo }])
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, inserts, gemini }
}
const pedido = (cuerpo: unknown) =>
  new Request('https://app.ejemplo.com/api/generaciones', {
    method: 'POST',
    headers: { 'content-type': 'application/json', [HEADER_USUARIO]: 'u-1' },
    body: JSON.stringify(cuerpo),
  })
const ok = { creativoId: ID_CREATIVO, instruccion: 'más oscuro' }

describe('leerOrigen con creativoId', () => {
  it('es un cambio sobre una imagen', () => {
    expect(leerOrigen(ok)).toEqual({ tipo: 'ajuste', creativoId: ID_CREATIVO, instruccion: 'más oscuro', promocionId: null })
  })
  it.each([{ piezaId: ID_PIEZA }, { fotoId: ID_FOTO }, { tandaId: ID_TANDA }])('mezclado con otro origen (%j): error', (otro) => {
    expect(leerOrigen({ ...ok, ...otro })).toHaveProperty('error')
  })
  it('pedido inválido: error común', () => {
    expect(leerOrigen({ ...ok, instruccion: 'x' })).toEqual({ error: 'Escribí qué querés cambiar (hasta 400 caracteres)' })
  })
})

describe('estimar un cambio de imagen', () => {
  it('foto real: hereda foto y edición, lleva base + instrucción, cuesta 2 imágenes de entrada y no llama a Gemini', async () => {
    const m = mundo()
    const r = await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)
    expect(r.status).toBe(201)
    expect(m.gemini).toHaveLength(0)
    const fila = m.inserts[0]!
    expect(fila).toMatchObject({
      organizacion_id: ORGANIZACION_PILOTO_ID,
      tipo: 'imagen',
      cantidad: 1,
      aspecto: '4:5',
      foto_id: ID_FOTO,
      edicion: 'fondo_estudio',
      base_creativo_id: ID_CREATIVO,
      instruccion: 'más oscuro',
      version_prompt: VERSION_PROMPT_AJUSTE,
      prompt: promptAjuste({ instruccion: 'más oscuro', anteriores: [], conFoto: true, composicion: null, aspecto: '4:5' }),
      costo_estimado_usd: estimarImagenes('gemini-nano-banana-2.1', 1, { imagenesEntrada: 2 }).topeTotalUsd,
      parametros: { aspecto: '4:5', ajuste: { instruccion: 'más oscuro', anteriores: [], baseCreativoId: ID_CREATIVO } },
    })
    for (const k of ['lote_id', 'referencia_foto_id', 'promocion_id', 'tanda_id', 'pieza_id']) expect(fila).not.toHaveProperty(k)
    expect((await r.json()).ajuste).toEqual({ instruccion: 'más oscuro', anteriores: [] })
  })

  it('cambio encadenado: el pedido de la base y los suyos pasan a "ya aplicados"', async () => {
    const base = { ...genFoto, parametros: { ajuste: { instruccion: 'más oscuro', anteriores: ['de noche'], baseCreativoId: 'x' } } }
    const m = mundo({ gen: base })
    await manejarEstimacion(pedido({ ...ok, instruccion: 'más oscuro todavía' }), entorno, m.f, () => AHORA)
    const fila = m.inserts[0]!
    expect(fila.parametros.ajuste.anteriores).toEqual(['de noche', 'más oscuro'])
    expect(fila.prompt).toContain('«más oscuro todavía»')
    expect(fila.prompt).toContain('«de noche»; «más oscuro»')
    expect(anterioresDe(base.parametros)).toEqual(['de noche', 'más oscuro'])
  })

  it('pieza: sin foto real (1 imagen de entrada), hereda la pieza, sin edición ni segunda imagen', async () => {
    const m = mundo({ gen: genPieza })
    const r = await manejarEstimacion(pedido({ ...ok, cantidad: 2 }), entorno, m.f, () => AHORA)
    expect(r.status).toBe(201)
    const fila = m.inserts[0]!
    expect(fila).toMatchObject({ pieza_id: ID_PIEZA, pieza_raiz_id: ID_RAIZ, cantidad: 2, costo_estimado_usd: estimarImagenes('gemini-nano-banana-2.1', 2, { imagenesEntrada: 1 }).topeTotalUsd })
    expect(fila).not.toHaveProperty('foto_id')
    expect(fila).not.toHaveProperty('edicion')
    expect(fila.prompt).not.toMatch(/SEGUNDA/)
  })

  it('promoción: hereda promocion_id y reserva la zona libre del texto', async () => {
    const m = mundo({ gen: genPromo })
    const r = await manejarEstimacion(pedido({ ...ok, promocionId: ID_PROMO }), entorno, m.f, () => AHORA)
    expect(r.status).toBe(201)
    const fila = m.inserts[0]!
    expect(fila).toMatchObject({ promocion_id: ID_PROMO, edicion: 'promocion' })
    expect(fila.prompt).toContain(composicion('abajo', 'centro'))
  })

  it('hija de tanda: hereda tanda_id y grupo (no promocion_id)', async () => {
    const m = mundo({ gen: { ...genPromo, promocion_id: null, tanda_id: ID_TANDA, grupo: 2 }, promo: { tanda_id: ID_TANDA, grupo: 2 } })
    const r = await manejarEstimacion(pedido({ ...ok, promocionId: ID_PROMO }), entorno, m.f, () => AHORA)
    expect(r.status).toBe(201)
    const fila = m.inserts[0]!
    expect(fila).toMatchObject({ tanda_id: ID_TANDA, grupo: 2 })
    expect(fila).not.toHaveProperty('promocion_id')
  })
})

describe('un cambio rechazado nunca llama a Gemini ni crea filas', () => {
  const casos: [string, Mundo, Record<string, unknown>, number][] = [
    ['pedido inválido', {}, { instruccion: 'x' }, 400],
    ['mezcla de orígenes', {}, { fotoId: ID_FOTO }, 400],
    ['lector', { rol: 'lector' }, {}, 403],
    ['creativo inexistente o de otra org', { creativo: null }, {}, 404],
    ['creativo sin imagen guardada', { creativo: { ruta: null } }, {}, 410],
    ['foto original borrada', { foto: 'borrada' }, {}, 410],
    ['imagen de promoción sin decir la promoción', { gen: genPromo }, {}, 400],
    ['promoción inexistente', { gen: genPromo, promo: null }, { promocionId: ID_PROMO }, 404],
    ['promoción que ya no es borrador', { gen: genPromo, promo: { estado: 'aprobada' } }, { promocionId: ID_PROMO }, 409],
    ['imagen de otra promoción', { gen: { ...genPromo, promocion_id: '12121212-1212-4212-8212-121212121212' } }, { promocionId: ID_PROMO }, 422],
    ['imagen de otro formato', { gen: genPromo, creativo: { aspecto: '1:1' } }, { promocionId: ID_PROMO }, 422],
    ['promoción pasada a una imagen que no es de promoción', {}, { promocionId: ID_PROMO }, 422],
  ]
  it.each(casos)('%s', async (_n, mundoOpts, cuerpo, status) => {
    const m = mundo(mundoOpts)
    const r = await manejarEstimacion(pedido({ ...ok, ...cuerpo }), entorno, m.f, () => AHORA)
    expect(r.status).toBe(status)
    expect(m.gemini).toHaveLength(0)
    expect(m.inserts).toHaveLength(0)
  })
})
