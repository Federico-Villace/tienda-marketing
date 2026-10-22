import { describe, it, expect, vi } from 'vitest'
import { HEADER_USUARIO } from '../auth/acceso'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { piezasDePrueba } from '../contenidista/fixture'
import { manejarEstimacion, leerOrigen } from './estimacion'
import { promptFoto } from './prompt'

const PIEZA_ID = '22222222-2222-4222-8222-222222222222'
const RAIZ_ID = '33333333-3333-4333-8333-333333333333'
const GEN_ID = '44444444-4444-4444-8444-444444444444'
const CLAVE = 'AIza-SECRETISIMA-1234'
const entorno = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_xyz',
  GEMINI_API_KEY: CLAVE,
  PRESUPUESTO_MENSUAL_USD: '10',
}
const AHORA = Date.parse('2026-10-26T15:00:00Z')

const imagenIg = piezasDePrueba()[1]!
const fila = (o: Record<string, unknown> = {}) => ({ id: PIEZA_ID, raiz_id: RAIZ_ID, estado: 'aprobada', pieza: imagenIg, ...o })

type Mundo = { rol?: string | null; pieza?: Record<string, unknown> | null; gastado?: number; falla?: boolean }
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
    if (url.pathname === '/rest/v1/piezas') {
      expect(url.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
      return Response.json(o.pieza === null ? [] : [o.pieza ?? fila()])
    }
    if (url.pathname === '/rest/v1/rpc/gasto_generaciones_mes') return Response.json(o.gastado ?? 0)
    if (url.pathname === '/rest/v1/generaciones' && init?.method === 'POST') {
      if (o.falla) return new Response('{"message":"boom"}', { status: 500 })
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
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  })
const ok = { piezaId: PIEZA_ID, motor: 'gemini-nano-banana-2.1', cantidad: 3 }

describe('estimar: camino feliz (S4.1)', () => {
  it('crea la fila estimada con el costo del servidor, vence en 15 min y no llama a Gemini', async () => {
    const m = mundo()
    const r = await manejarEstimacion(pedido(ok, 'u-7'), entorno, m.f, () => AHORA)
    expect(r.status).toBe(201)
    expect(m.gemini).toHaveLength(0)
    expect(m.inserts).toHaveLength(1)
    const fila = m.inserts[0]!
    expect(fila).toMatchObject({
      organizacion_id: ORGANIZACION_PILOTO_ID,
      tipo: 'imagen',
      motor: 'gemini-nano-banana-2.1',
      cantidad: 3,
      aspecto: '4:5',
      pieza_id: PIEZA_ID,
      pieza_raiz_id: RAIZ_ID,
      creado_por: 'u-7',
      version_prompt: 'productor-v1',
      costo_estimado_usd: 0.13005,
      vence_en: new Date(AHORA + 15 * 60_000).toISOString(),
      parametros: { aspecto: '4:5', image_size: '1K', mime_type: 'image/jpeg', thinking: 'minimal' },
    })
    expect(fila.prompt).toContain(imagenIg.briefVisual)
    expect(fila.estado).toBeUndefined()
    const cuerpo = await r.json()
    expect(cuerpo.id).toBe(GEN_ID)
    expect(cuerpo.costoEstimadoUsd).toBe(0.13005)
    expect(cuerpo.generacion).toMatchObject({
      id: GEN_ID, motor: 'gemini-nano-banana-2.1', cantidad: 3, aspecto: '4:5',
      porImagenUsd: 0.0336, listaUsd: 0.1008, costoEstimadoUsd: 0.13005, venceEn: new Date(AHORA + 15 * 60_000).toISOString(),
    })
    expect(cuerpo.mes).toEqual({ gastadoUsd: 0, topeUsd: 10 })
    expect(cuerpo.excedeTope).toBe(false)
  })

  it('marca excedeTope cuando gastado + estimado supera el tope (el control real es la RPC)', async () => {
    const m = mundo({ gastado: 9.95 })
    const r = await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)
    expect(r.status).toBe(201)
    expect((await r.json()).excedeTope).toBe(true)
  })

  it('el prompt y la respuesta no llevan la clave', async () => {
    const m = mundo()
    const r = await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)
    expect(JSON.stringify(m.inserts) + (await r.text())).not.toContain(CLAVE)
  })
})

describe('estimar: el cliente no manda precios (S4.2)', () => {
  it('ignora costo, precio y todo campo extra', async () => {
    const m = mundo()
    const r = await manejarEstimacion(
      pedido({ ...ok, costo: 987654, precio: 987654, costo_estimado_usd: 987654, costoEstimadoUsd: 987654, porImagenUsd: 987654, estado: 'confirmada' }),
      entorno,
      m.f,
      () => AHORA,
    )
    expect(r.status).toBe(201)
    expect(m.inserts[0]!.costo_estimado_usd).toBe(0.13005)
    expect(m.inserts[0]!.estado).toBeUndefined()
    expect(JSON.stringify(m.inserts[0])).not.toContain('987654')
  })
})

describe('estimar: validación (S4.3, S4.4)', () => {
  it.each([0, 5, 1.5, '2', null, undefined, -1])('cantidad %s es 400', async (cantidad) => {
    const m = mundo()
    const r = await manejarEstimacion(pedido({ ...ok, cantidad }), entorno, m.f, () => AHORA)
    expect(r.status).toBe(400)
    expect(m.inserts).toHaveLength(0)
  })

  it('un motor desconocido es 400 sin insertar ni llamar a Gemini', async () => {
    const m = mundo()
    const r = await manejarEstimacion(pedido({ ...ok, motor: 'imagen-4.0-generate' }), entorno, m.f, () => AHORA)
    expect(r.status).toBe(400)
    expect(m.inserts).toHaveLength(0)
    expect(m.gemini).toHaveLength(0)
  })

  it('sin motor usa el por defecto', async () => {
    const m = mundo()
    const { motor: _, ...sinMotor } = ok
    expect((await manejarEstimacion(pedido(sinMotor), entorno, m.f, () => AHORA)).status).toBe(201)
    expect(m.inserts[0]!.motor).toBe('gemini-nano-banana-2.1')
  })

  it('piezaId que no es UUID, JSON roto o cuerpo vacío es 400', async () => {
    const m = mundo()
    for (const cuerpo of [{ ...ok, piezaId: 'abc' }, '{no es json', 'null', '[]']) {
      expect((await manejarEstimacion(pedido(cuerpo), entorno, m.f, () => AHORA)).status).toBe(400)
    }
  })
})

describe('estimar: elegibilidad (R3)', () => {
  it('S3.3 pieza inexistente o de otra organización es 404', async () => {
    const m = mundo({ pieza: null })
    expect((await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)).status).toBe(404)
  })

  it('S3.1 un borrador es 422', async () => {
    const m = mundo({ pieza: fila({ estado: 'borrador' }) })
    expect((await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)).status).toBe(422)
    expect(m.inserts).toHaveLength(0)
  })

  it.each(['video', 'reel'])('S3.2 formato %s es 422', async (formato) => {
    const m = mundo({ pieza: fila({ pieza: { ...imagenIg, formato } }) })
    expect((await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)).status).toBe(422)
    expect(m.inserts).toHaveLength(0)
  })

  it('S3.4 historia y carrusel pasan, con su proporción', async () => {
    const h = mundo({ pieza: fila({ pieza: { ...imagenIg, formato: 'historia' } }) })
    await manejarEstimacion(pedido(ok), entorno, h.f, () => AHORA)
    expect(h.inserts[0]!.aspecto).toBe('9:16')
    const c = mundo({ pieza: fila({ pieza: { ...imagenIg, formato: 'carrusel', plataforma: 'facebook' } }) })
    await manejarEstimacion(pedido(ok), entorno, c.f, () => AHORA)
    expect(c.inserts[0]!.aspecto).toBe('1:1')
  })

  it('el motor pro no manda pensamiento en los parámetros', async () => {
    const m = mundo()
    await manejarEstimacion(pedido({ ...ok, motor: 'gemini-3-pro-image', cantidad: 2 }), entorno, m.f, () => AHORA)
    expect(m.inserts[0]!.parametros.thinking).toBeNull()
    expect(m.inserts[0]!.costo_estimado_usd).toBe(0.37)
  })
})

describe('estimar: acceso (S4.5, S4.6)', () => {
  it('sin sesión 401, lector 403, sin escribir', async () => {
    const m = mundo()
    expect((await manejarEstimacion(pedido(ok, null), entorno, m.f, () => AHORA)).status).toBe(401)
    const l = mundo({ rol: 'lector' })
    expect((await manejarEstimacion(pedido(ok), entorno, l.f, () => AHORA)).status).toBe(403)
    expect(l.inserts).toHaveLength(0)
  })

  it('sin GEMINI_API_KEY o sin tope es 503 y no hace ninguna llamada', async () => {
    for (const e of [{ ...entorno, GEMINI_API_KEY: '' }, { ...entorno, PRESUPUESTO_MENSUAL_USD: undefined }]) {
      const m = mundo()
      expect((await manejarEstimacion(pedido(ok), e, m.f, () => AHORA)).status).toBe(503)
      expect(m.f).not.toHaveBeenCalled()
    }
  })

  it('una falla de la base es 500 genérico sin detalles', async () => {
    const m = mundo({ falla: true })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)
    expect(r.status).toBe(500)
    expect(JSON.stringify(await r.json())).not.toContain('boom')
    spy.mockRestore()
  })
})

const FOTO_ID = '77777777-7777-4777-8777-777777777777'
const okFoto = { fotoId: FOTO_ID, edicion: 'fondo_estudio', aspecto: '4:5', motor: 'gemini-nano-banana-2.1', cantidad: 2 }

type MundoFoto = { foto?: Record<string, unknown> | null; gastado?: number }
function mundoFoto(o: MundoFoto = {}) {
  const inserts: Record<string, any>[] = []
  const gemini: string[] = []
  const storage: string[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    if (url.hostname.includes('googleapis')) {
      gemini.push(String(u))
      throw new Error('Gemini no se llama al estimar')
    }
    if (url.pathname.startsWith('/storage/')) {
      storage.push(url.pathname)
      throw new Error('Estimar no toca Storage')
    }
    if (url.pathname === '/rest/v1/miembros') return Response.json([{ rol: 'director' }])
    if (url.pathname === '/rest/v1/fotos') {
      expect(url.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
      expect(url.searchParams.get('id')).toBe(`eq.${FOTO_ID}`)
      return Response.json(o.foto === null ? [] : [o.foto ?? { id: FOTO_ID, ruta: 'org/x.jpg', borrada_en: null }])
    }
    if (url.pathname === '/rest/v1/piezas') throw new Error('El camino de foto no lee piezas')
    if (url.pathname === '/rest/v1/rpc/gasto_generaciones_mes') return Response.json(o.gastado ?? 0)
    if (url.pathname === '/rest/v1/generaciones' && init?.method === 'POST') {
      const cuerpo = JSON.parse(String(init.body))
      inserts.push(cuerpo)
      return Response.json([{ id: GEN_ID, ...cuerpo }])
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, inserts, gemini, storage }
}

describe('leerOrigen (F8)', () => {
  it('pieza: devuelve el tipo y el id', () => {
    expect(leerOrigen({ piezaId: PIEZA_ID })).toEqual({ tipo: 'pieza', piezaId: PIEZA_ID })
  })
  it('foto: devuelve foto, edición y aspecto', () => {
    expect(leerOrigen(okFoto)).toEqual({ tipo: 'foto', fotoId: FOTO_ID, edicion: 'fondo_estudio', aspecto: '4:5' })
  })
  it('ambos o ninguno es 400', () => {
    expect(leerOrigen({ piezaId: PIEZA_ID, fotoId: FOTO_ID })).toMatchObject({ error: expect.any(String) })
    expect(leerOrigen({})).toMatchObject({ error: expect.any(String) })
    expect(leerOrigen({ piezaId: null, fotoId: null })).toMatchObject({ error: expect.any(String) })
  })
})

describe('estimar desde una foto (F8)', () => {
  it('S8.4 inserta la generación de foto con el tope conFoto y el prompt de foto', async () => {
    const m = mundoFoto()
    const r = await manejarEstimacion(pedido(okFoto, 'u-7'), entorno, m.f, () => AHORA)
    expect(r.status).toBe(201)
    expect(m.gemini).toHaveLength(0)
    expect(m.storage).toHaveLength(0)
    expect(m.inserts).toHaveLength(1)
    const fila = m.inserts[0]!
    expect(fila).toMatchObject({
      organizacion_id: ORGANIZACION_PILOTO_ID,
      tipo: 'imagen',
      motor: 'gemini-nano-banana-2.1',
      cantidad: 2,
      aspecto: '4:5',
      foto_id: FOTO_ID,
      edicion: 'fondo_estudio',
      creado_por: 'u-7',
      version_prompt: 'productor-foto-v1',
      costo_estimado_usd: 0.09006,
      vence_en: new Date(AHORA + 15 * 60_000).toISOString(),
    })
    expect(fila.pieza_id).toBeUndefined()
    expect(fila.pieza_raiz_id).toBeUndefined()
    expect(fila.prompt).toBe(promptFoto('fondo_estudio', '4:5'))
    expect(fila.estado).toBeUndefined()
  })

  it('S8.5 responde 201 con la misma forma que hoy más origen y edicion', async () => {
    const m = mundoFoto({ gastado: 9.95 })
    const r = await manejarEstimacion(pedido(okFoto), entorno, m.f, () => AHORA)
    const c = await r.json()
    expect(c.id).toBe(GEN_ID)
    expect(c.costoEstimadoUsd).toBe(0.09006)
    expect(c.generacion).toMatchObject({
      id: GEN_ID, motor: 'gemini-nano-banana-2.1', cantidad: 2, aspecto: '4:5', edicion: 'fondo_estudio', origen: 'foto',
      porImagenUsd: 0.0336, listaUsd: 0.0672, costoEstimadoUsd: 0.09006,
    })
    expect(c.mes).toEqual({ gastadoUsd: 9.95, topeUsd: 10 })
    expect(c.excedeTope).toBe(true)
  })

  it('S8.1 una foto inexistente o de otra organización es 404, sin insertar', async () => {
    const m = mundoFoto({ foto: null })
    expect((await manejarEstimacion(pedido(okFoto), entorno, m.f, () => AHORA)).status).toBe(404)
    expect(m.inserts).toHaveLength(0)
  })

  it('S8.2 una foto borrada es 410 "La foto se borró"', async () => {
    for (const foto of [
      { id: FOTO_ID, ruta: null, borrada_en: '2026-10-26T10:00:00Z' },
      { id: FOTO_ID, ruta: 'org/x.jpg', borrada_en: '2026-10-26T10:00:00Z' },
    ]) {
      const m = mundoFoto({ foto })
      const r = await manejarEstimacion(pedido(okFoto), entorno, m.f, () => AHORA)
      expect(r.status).toBe(410)
      expect((await r.json()).error).toBe('La foto se borró.')
      expect(m.inserts).toHaveLength(0)
    }
  })

  it('S8.3 edición o aspecto inválidos, o fotoId que no es UUID, son 400', async () => {
    const m = mundoFoto()
    for (const malo of [
      { edicion: 'inventada' }, { edicion: 'toString' }, { edicion: undefined },
      { aspecto: '16:9' }, { aspecto: undefined }, { fotoId: 'abc' },
    ]) {
      expect((await manejarEstimacion(pedido({ ...okFoto, ...malo }), entorno, m.f, () => AHORA)).status).toBe(400)
    }
    expect(m.inserts).toHaveLength(0)
  })

  it('piezaId y fotoId a la vez, o ninguno, es 400', async () => {
    const m = mundoFoto()
    expect((await manejarEstimacion(pedido({ ...okFoto, piezaId: PIEZA_ID }), entorno, m.f, () => AHORA)).status).toBe(400)
    expect((await manejarEstimacion(pedido({ motor: okFoto.motor, cantidad: 2 }), entorno, m.f, () => AHORA)).status).toBe(400)
    expect(m.inserts).toHaveLength(0)
  })

  it('S8.6 ignora cualquier precio que venga en el body', async () => {
    const m = mundoFoto()
    const r = await manejarEstimacion(
      pedido({ ...okFoto, costo: 987654, costo_estimado_usd: 987654, porImagenUsd: 987654, estado: 'confirmada' }),
      entorno, m.f, () => AHORA,
    )
    expect(r.status).toBe(201)
    expect(m.inserts[0]!.costo_estimado_usd).toBe(0.09006)
    expect(JSON.stringify(m.inserts[0])).not.toContain('987654')
  })

  it('la cantidad y el motor se validan igual que en el camino de pieza', async () => {
    const m = mundoFoto()
    expect((await manejarEstimacion(pedido({ ...okFoto, cantidad: 5 }), entorno, m.f, () => AHORA)).status).toBe(400)
    expect((await manejarEstimacion(pedido({ ...okFoto, motor: 'imagen-4.0-generate' }), entorno, m.f, () => AHORA)).status).toBe(400)
    expect(m.inserts).toHaveLength(0)
  })

  it('con el motor Pro el tope sube por la entrada de 560 tokens', async () => {
    const m = mundoFoto()
    await manejarEstimacion(pedido({ ...okFoto, motor: 'gemini-3-pro-image', cantidad: 1 }), entorno, m.f, () => AHORA)
    expect(m.inserts[0]!.costo_estimado_usd).toBe(0.18612)
  })
})
