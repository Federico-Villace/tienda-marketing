import { describe, it, expect, vi } from 'vitest'
import { HEADER_USUARIO } from '../auth/acceso'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { manejarEstimacion, leerOrigen } from './estimacion'
import { promptEscena, type PedidoEscena } from '../promocion/escena'
import { filaPromocion, ID_FOTO, ID_PROMO } from '../promocion/fixture'

const GEN_ID = '44444444-4444-4444-8444-444444444444'
const CLAVE = 'AIza-SECRETISIMA-1234'
const entorno = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_xyz',
  GEMINI_API_KEY: CLAVE,
  PRESUPUESTO_MENSUAL_USD: '10',
}
const AHORA = Date.parse('2026-10-26T15:00:00Z')
const escena = (o: Partial<PedidoEscena> = {}) =>
  promptEscena({ fondo: 'fondo_estudio', zona: 'abajo', aspecto: '4:5', posicionMoto: 'centro', descripcion: null, conReferencia: false, ...o })

const promo = (o: Record<string, unknown> = {}) =>
  filaPromocion({ id: ID_PROMO, foto_id: ID_FOTO, plantilla: 'oferta_abajo', fondo: 'fondo_estudio', aspecto: '4:5', ...o } as never)

type Mundo = { rol?: string | null; promo?: Record<string, unknown> | null; foto?: 'ok' | 'inexistente' | 'borrada'; gastado?: number }
function mundo(o: Mundo = {}) {
  const inserts: Record<string, any>[] = []
  const gemini: string[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    if (url.hostname.includes('googleapis')) {
      gemini.push(String(u))
      throw new Error('Gemini no se llama al estimar')
    }
    if (url.pathname === '/rest/v1/miembros') return Response.json(o.rol === null ? [] : [{ rol: o.rol ?? 'director' }])
    if (url.pathname === '/rest/v1/promociones') {
      expect(url.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
      return Response.json(o.promo === null ? [] : [promo(o.promo ?? {})])
    }
    if (url.pathname === '/rest/v1/fotos') {
      if (o.foto === 'inexistente') return Response.json([])
      return Response.json([{ id: ID_FOTO, ruta: o.foto === 'borrada' ? null : 'org/f.jpg', borrada_en: o.foto === 'borrada' ? '2026-10-20T00:00:00Z' : null }])
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
  new Request('https://app.ejemplo.com/api/generaciones', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(usuario ? { [HEADER_USUARIO]: usuario } : {}) },
    body: JSON.stringify(cuerpo),
  })
const ok = { promocionId: ID_PROMO, motor: 'gemini-nano-banana-2.1', cantidad: 2 }

describe('leerOrigen con promocionId', () => {
  it('una promoción es un origen más', () => {
    expect(leerOrigen({ promocionId: ID_PROMO })).toEqual({ tipo: 'promocion', promocionId: ID_PROMO })
  })
  it('es excluyente con la pieza y con la foto (400)', () => {
    expect(leerOrigen({ promocionId: ID_PROMO, piezaId: ID_PROMO })).toHaveProperty('error')
    expect(leerOrigen({ promocionId: ID_PROMO, fotoId: ID_FOTO, edicion: 'fondo_estudio', aspecto: '4:5' })).toHaveProperty('error')
  })
  it('un id inválido es un error', () => {
    expect(leerOrigen({ promocionId: 'abc' })).toHaveProperty('error')
  })
  it('lo de antes no cambia', () => {
    expect(leerOrigen({ piezaId: ID_PROMO, fotoId: ID_FOTO })).toEqual({ error: 'Mandá una pieza o una foto, no las dos.' })
  })
})

describe('estimar la escena de una promoción', () => {
  it('crea la fila estimada con foto_id, edicion "promocion", promocion_id y el prompt de escena; no llama a Gemini', async () => {
    const m = mundo()
    const r = await manejarEstimacion(pedido(ok, 'u-7'), entorno, m.f, () => AHORA)
    expect(r.status).toBe(201)
    expect(m.gemini).toHaveLength(0)
    expect(m.inserts).toHaveLength(1)
    expect(m.inserts[0]).toMatchObject({
      organizacion_id: ORGANIZACION_PILOTO_ID,
      tipo: 'imagen',
      motor: 'gemini-nano-banana-2.1',
      cantidad: 2,
      aspecto: '4:5',
      foto_id: ID_FOTO,
      edicion: 'promocion',
      promocion_id: ID_PROMO,
      creado_por: 'u-7',
      version_prompt: 'promocion-escena-v2',
      prompt: escena(),
      vence_en: new Date(AHORA + 15 * 60_000).toISOString(),
    })
    expect(m.inserts[0]).not.toHaveProperty('pieza_id')
  })

  it('presupuesta la foto de entrada (conFoto) como cualquier edición de foto', async () => {
    const m = mundo()
    const foto = await manejarEstimacion(
      pedido({ fotoId: ID_FOTO, edicion: 'fondo_estudio', aspecto: '4:5', motor: 'gemini-nano-banana-2.1', cantidad: 2 }),
      entorno,
      m.f,
      () => AHORA,
    )
    const delFoto = (await foto.json()).costoEstimadoUsd
    const prom = await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)
    const body = await prom.json()
    expect(body.costoEstimadoUsd).toBe(delFoto)
    expect(body.generacion).toMatchObject({ origen: 'promocion', cantidad: 2, aspecto: '4:5' })
  })

  it('el formato sale de la promoción y no del body; el cliente no manda precios', async () => {
    const m = mundo({ promo: { aspecto: '9:16' } })
    await manejarEstimacion(pedido({ ...ok, aspecto: '1:1', costoEstimadoUsd: 987654 }), entorno, m.f, () => AHORA)
    expect(m.inserts[0]!.aspecto).toBe('9:16')
    expect(JSON.stringify(m.inserts[0])).not.toContain('987654')
  })

  it('la zona libre sigue a la plantilla elegida', async () => {
    const m = mundo({ promo: { plantilla: 'oferta_arriba', fondo: 'escenario_ruta' } })
    await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)
    expect(m.inserts[0]!.prompt).toBe(escena({ fondo: 'escenario_ruta', zona: 'arriba' }))
  })

  it('la descripción del fondo y la posición de la moto entran al prompt', async () => {
    const m = mundo({ promo: { fondo_descripcion: 'Con luz del atardecer', posicion_moto: 'izquierda' } })
    await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)
    expect(m.inserts[0]!.prompt).toBe(escena({ descripcion: 'Con luz del atardecer', posicionMoto: 'izquierda' }))
    expect(m.inserts[0]!.prompt).toContain('«Con luz del atardecer»')
  })

  it('las indicaciones para el redactor ya NO van a la escena', async () => {
    const m = mundo({ promo: { datos: { precio: { moneda: 'ARS', monto: 1 }, promo: { tipo: 'ninguna', detalle: '' }, lugar: 'Quilmes', indicaciones: 'WhatsApp 11 5555 1234' } } })
    await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)
    expect(m.inserts[0]!.prompt).toBe(escena())
    expect(m.inserts[0]!.prompt).not.toContain('5555')
  })

  it('el texto al costado deja libre la mitad opuesta a la moto', async () => {
    const m = mundo({ promo: { plantilla: 'oferta_costado', posicion_moto: 'derecha' } })
    await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)
    expect(m.inserts[0]!.prompt).toBe(escena({ zona: 'izquierda', posicionMoto: 'derecha' }))
  })

  it('texto al costado con la moto al centro: 422, sin insertar ni llamar a Gemini', async () => {
    const m = mundo({ promo: { plantilla: 'oferta_costado', posicion_moto: 'centro' } })
    const r = await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)
    expect(r.status).toBe(422)
    expect((await r.json()).error).toBe('Si el texto va al costado, la moto tiene que ir a la izquierda o a la derecha.')
    expect(m.inserts).toHaveLength(0)
    expect(m.gemini).toHaveLength(0)
  })

  it('la respuesta y lo guardado no llevan la clave', async () => {
    const m = mundo()
    const r = await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)
    expect(JSON.stringify(m.inserts) + (await r.text())).not.toContain(CLAVE)
  })
})

describe('rechazos: no se crea nada ni se llama a Gemini', () => {
  const sinEfectos = (m: ReturnType<typeof mundo>) => {
    expect(m.inserts).toHaveLength(0)
    expect(m.gemini).toHaveLength(0)
  }
  it('sin sesión 401 y lector 403', async () => {
    const m = mundo()
    expect((await manejarEstimacion(pedido(ok, null), entorno, m.f, () => AHORA)).status).toBe(401)
    const m2 = mundo({ rol: 'lector' })
    expect((await manejarEstimacion(pedido(ok), entorno, m2.f, () => AHORA)).status).toBe(403)
    sinEfectos(m)
    sinEfectos(m2)
  })
  it('promoción inexistente 404', async () => {
    const m = mundo({ promo: null })
    const r = await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)
    expect(r.status).toBe(404)
    expect((await r.json()).error).toBe('No se encontró la promoción.')
    sinEfectos(m)
  })
  it('una aprobada o descartada 409', async () => {
    for (const estado of ['aprobada', 'descartada']) {
      const m = mundo({ promo: { estado } })
      expect((await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)).status).toBe(409)
      sinEfectos(m)
    }
  })
  it('foto borrada 410 y foto inexistente 404', async () => {
    const m = mundo({ foto: 'borrada' })
    expect((await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)).status).toBe(410)
    sinEfectos(m)
    const m2 = mundo({ foto: 'inexistente' })
    expect((await manejarEstimacion(pedido(ok), entorno, m2.f, () => AHORA)).status).toBe(404)
    sinEfectos(m2)
  })
  it('sin diseño o sin fondo elegido 422', async () => {
    for (const falta of [{ plantilla: null }, { fondo: null }]) {
      const m = mundo({ promo: falta })
      const r = await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)
      expect(r.status).toBe(422)
      expect((await r.json()).error).toBe('Elegí un diseño primero.')
      sinEfectos(m)
    }
  })
  it('promoción junto a pieza o foto: 400', async () => {
    const m = mundo()
    expect((await manejarEstimacion(pedido({ ...ok, piezaId: ID_PROMO }), entorno, m.f, () => AHORA)).status).toBe(400)
    expect((await manejarEstimacion(pedido({ ...ok, fotoId: ID_FOTO }), entorno, m.f, () => AHORA)).status).toBe(400)
    sinEfectos(m)
  })
})
