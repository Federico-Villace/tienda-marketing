import { describe, it, expect, vi } from 'vitest'
import { HEADER_USUARIO } from '../auth/acceso'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { manejarEstimacion, leerOrigen } from './estimacion'
import { promptEscena, type PedidoEscena } from '../promocion/escena'
import { filaPromocion, ID_FOTO } from '../promocion/fixture'
import { MARCAS } from '../datos/marcas'

const ID_TANDA = '55555555-5555-4555-8555-555555555555'
const ID_PROMO = '22222222-2222-4222-8222-222222222222'
const GEN_ID = '44444444-4444-4444-8444-444444444444'
const entorno = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_xyz',
  GEMINI_API_KEY: 'AIza-SECRETISIMA-1234',
  PRESUPUESTO_MENSUAL_USD: '10',
}
const AHORA = Date.parse('2026-10-26T15:00:00Z')
const escena = (o: Partial<PedidoEscena> = {}) =>
  promptEscena({ fondo: 'fondo_estudio', zona: 'abajo', aspecto: '4:5', posicionMoto: 'centro', descripcion: null, conReferencia: false, ...o })

const hija = (i: number, o: Record<string, unknown> = {}) =>
  filaPromocion({
    id: `hija-${i}`,
    marca_id: MARCAS[i]!.id,
    tanda_id: ID_TANDA,
    foto_id: ID_FOTO,
    plantilla: 'oferta_abajo',
    fondo: 'fondo_estudio',
    aspecto: '4:5',
    ...o,
  } as never)

const ID_REF = '88888888-8888-4888-8888-888888888888'
type Mundo = { rol?: string | null; hijas?: ReturnType<typeof hija>[]; foto?: 'ok' | 'inexistente' | 'borrada'; ref?: 'ok' | 'borrada'; gastado?: number }
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
      expect(url.searchParams.get('tanda_id')).toBe(`eq.${ID_TANDA}`)
      return Response.json(o.hijas ?? [hija(0), hija(2), hija(5)])
    }
    if (url.pathname === '/rest/v1/fotos') {
      if (url.searchParams.get('id') === `eq.${ID_REF}`) {
        expect(url.searchParams.get('uso')).toBe('eq.inspiracion')
        return Response.json([{ id: ID_REF, ruta: o.ref === 'borrada' ? null : 'org/ref.jpg', borrada_en: o.ref === 'borrada' ? '2026-10-20T00:00:00Z' : null }])
      }
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
const ok = { tandaId: ID_TANDA, motor: 'gemini-nano-banana-2.1', cantidad: 2 }

describe('leerOrigen con tandaId', () => {
  it('una tanda es un origen más', () => {
    expect(leerOrigen({ tandaId: ID_TANDA })).toEqual({ tipo: 'tanda', tandaId: ID_TANDA })
  })
  it('es excluyente con pieza, foto y promoción (400)', () => {
    expect(leerOrigen({ tandaId: ID_TANDA, piezaId: ID_PROMO })).toHaveProperty('error')
    expect(leerOrigen({ tandaId: ID_TANDA, promocionId: ID_PROMO })).toHaveProperty('error')
    expect(leerOrigen({ tandaId: ID_TANDA, fotoId: ID_FOTO, edicion: 'fondo_estudio', aspecto: '4:5' })).toHaveProperty('error')
  })
  it('un id inválido es un error', () => {
    expect(leerOrigen({ tandaId: 'abc' })).toHaveProperty('error')
  })
  it('lo de antes no cambia', () => {
    expect(leerOrigen({ promocionId: ID_PROMO })).toEqual({ tipo: 'promocion', promocionId: ID_PROMO })
  })
})

describe('estimar la escena de una tanda', () => {
  it('UNA fila estimada con tanda_id (sin promocion_id), el prompt de la primera hija y N promociones; no llama a Gemini', async () => {
    const m = mundo()
    const r = await manejarEstimacion(pedido(ok, 'u-7'), entorno, m.f, () => AHORA)
    expect(r.status).toBe(201)
    expect(m.gemini).toHaveLength(0)
    expect(m.inserts).toHaveLength(1)
    expect(m.inserts[0]).toMatchObject({
      organizacion_id: ORGANIZACION_PILOTO_ID,
      tipo: 'imagen',
      cantidad: 2,
      aspecto: '4:5',
      foto_id: ID_FOTO,
      edicion: 'promocion',
      tanda_id: ID_TANDA,
      creado_por: 'u-7',
      version_prompt: 'promocion-escena-v3',
      prompt: escena(),
    })
    expect(m.inserts[0]).not.toHaveProperty('promocion_id')
    const b = await r.json()
    expect(b.generacion).toMatchObject({ origen: 'tanda', promociones: 3, cantidad: 2 })
  })

  it('cuesta lo mismo que la escena de UNA promoción: un solo cobro, no N', async () => {
    const m = mundo()
    const una = await (await manejarEstimacion(pedido({ ...ok, tandaId: undefined, fotoId: ID_FOTO, edicion: 'fondo_estudio', aspecto: '4:5' }), entorno, m.f, () => AHORA)).json()
    const tanda = await (await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)).json()
    expect(tanda.costoEstimadoUsd).toBe(una.costoEstimadoUsd)
  })

  it('las hijas descartadas no cuentan', async () => {
    const m = mundo({ hijas: [hija(0), hija(2, { estado: 'descartada', fondo: 'escenario_ruta' })] })
    const r = await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)
    expect(r.status).toBe(201)
    expect((await r.json()).generacion.promociones).toBe(1)
  })

  it('con foto de inspiración compartida: UNA escena con la referencia, un solo cobro (con la segunda imagen de entrada)', async () => {
    const m = mundo({ hijas: [hija(0, { inspiracion_foto_id: ID_REF }), hija(2, { inspiracion_foto_id: ID_REF }), hija(5, { inspiracion_foto_id: ID_REF })] })
    const r = await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)
    expect(r.status).toBe(201)
    expect(m.inserts[0]).toMatchObject({ tanda_id: ID_TANDA, referencia_foto_id: ID_REF, prompt: escena({ conReferencia: true }), costo_estimado_usd: 0.09342 })
    expect((await r.json()).generacion).toMatchObject({ promociones: 3, conInspiracion: true })
  })

  it('si una hija tiene otra inspiración (o ninguna), no comparten escena: 422 diciendo que difiere la foto de inspiración', async () => {
    const m = mundo({ hijas: [hija(0, { inspiracion_foto_id: ID_REF }), hija(2)] })
    const r = await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)
    expect(r.status).toBe(422)
    expect((await r.json()).difieren).toEqual(['foto de inspiración'])
    expect(m.inserts).toHaveLength(0)
  })

  it('la inspiración borrada es 410 sin crear nada', async () => {
    const m = mundo({ ref: 'borrada', hijas: [hija(0, { inspiracion_foto_id: ID_REF }), hija(2, { inspiracion_foto_id: ID_REF })] })
    expect((await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)).status).toBe(410)
    expect(m.inserts).toHaveLength(0)
    expect(m.gemini).toHaveLength(0)
  })

  it('la descripción del fondo y la moto compartidas entran al prompt de la tanda; el texto al costado con la moto al centro es 422', async () => {
    const m = mundo({ hijas: [hija(0, { fondo_descripcion: 'de noche', posicion_moto: 'derecha' }), hija(2, { fondo_descripcion: 'de noche', posicion_moto: 'derecha' })] })
    await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)
    expect(m.inserts[0]!.prompt).toBe(escena({ descripcion: 'de noche', posicionMoto: 'derecha' }))
    const m2 = mundo({ hijas: [hija(0, { plantilla: 'oferta_costado' }), hija(2, { plantilla: 'oferta_costado' })] })
    const r = await manejarEstimacion(pedido(ok), entorno, m2.f, () => AHORA)
    expect(r.status).toBe(422)
    expect(m2.inserts).toHaveLength(0)
  })

  it('"Usar solo mi descripción" sin descripción ni inspiración: 422 sin crear nada', async () => {
    const m = mundo({ hijas: [hija(0, { fondo: 'solo_descripcion' }), hija(2, { fondo: 'solo_descripcion' })] })
    const r = await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)
    expect(r.status).toBe(422)
    expect(m.inserts).toHaveLength(0)
    expect(m.gemini).toHaveLength(0)
  })
  it('la escena compartida guarda y devuelve con qué se generó', async () => {
    const d = { fondo: 'solo_descripcion', fondo_descripcion: 'noche en puerto madero', posicion_moto: 'derecha', inspiracion_foto_id: ID_REF }
    const m = mundo({ hijas: [hija(0, d), hija(2, d)] })
    const r = await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)
    expect(r.status).toBe(201)
    const usada = { fondo: 'solo_descripcion', descripcion: 'noche en puerto madero', conInspiracion: true, posicionMoto: 'derecha' }
    expect(m.inserts[0]!.parametros.escena).toEqual(usada)
    expect((await r.json()).generacion.escena).toEqual(usada)
  })
  it('el cliente no manda precios', async () => {
    const m = mundo()
    await manejarEstimacion(pedido({ ...ok, costoEstimadoUsd: 987654 }), entorno, m.f, () => AHORA)
    expect(JSON.stringify(m.inserts[0])).not.toContain('987654')
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
  it('tanda inexistente (o sin hijas vivas) 404', async () => {
    for (const hijas of [[], [hija(0, { estado: 'descartada' })]]) {
      const m = mundo({ hijas })
      const r = await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)
      expect(r.status).toBe(404)
      expect((await r.json()).error).toBe('No se encontró la tanda.')
      sinEfectos(m)
    }
  })
  it('si alguna hija ya no es borrador (aprobada): 409', async () => {
    const m = mundo({ hijas: [hija(0), hija(2, { estado: 'aprobada' })] })
    const r = await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)
    expect(r.status).toBe(409)
    sinEfectos(m)
  })
  it('si las hijas no comparten escena: 422 diciendo qué difiere', async () => {
    const m = mundo({ hijas: [hija(0), hija(2, { fondo: 'escenario_ruta', aspecto: '9:16' })] })
    const r = await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)
    expect(r.status).toBe(422)
    const b = await r.json()
    expect(b.difieren).toEqual(['formato', 'fondo'])
    expect(b.error).toMatch(/formato/)
    expect(b.error).toMatch(/fondo/)
    sinEfectos(m)
  })
  it('sin diseño o sin fondo en alguna hija: 422 "Elegí un diseño primero."', async () => {
    for (const falta of [{ plantilla: null }, { fondo: null }]) {
      const m = mundo({ hijas: [hija(0), hija(2, falta)] })
      const r = await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)
      expect(r.status).toBe(422)
      expect((await r.json()).error).toBe('Elegí un diseño primero.')
      sinEfectos(m)
    }
  })
  it('foto borrada 410 e inexistente 404', async () => {
    const m = mundo({ foto: 'borrada' })
    expect((await manejarEstimacion(pedido(ok), entorno, m.f, () => AHORA)).status).toBe(410)
    sinEfectos(m)
    const m2 = mundo({ foto: 'inexistente' })
    expect((await manejarEstimacion(pedido(ok), entorno, m2.f, () => AHORA)).status).toBe(404)
    sinEfectos(m2)
  })
  it('cantidad inválida 400 sin leer nada', async () => {
    const m = mundo()
    expect((await manejarEstimacion(pedido({ ...ok, cantidad: 9 }), entorno, m.f, () => AHORA)).status).toBe(400)
    sinEfectos(m)
  })
})
