import { describe, it, expect, vi } from 'vitest'
import { HEADER_USUARIO } from '../auth/acceso'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { manejarConfirmacion } from './confirmar'
import { manejarEstimacion } from './estimacion'
import { filaPromocion } from '../promocion/fixture'

const GEN_ID = '44444444-4444-4444-8444-444444444444'
const FOTO_ID = '77777777-7777-4777-8777-777777777777'
const REF_ID = '88888888-8888-4888-8888-888888888888'
const RUTA = `${ORGANIZACION_PILOTO_ID}/${FOTO_ID}.jpg`
const RUTA_REF = `${ORGANIZACION_PILOTO_ID}/${REF_ID}.jpg`
const CLAVE = 'AIza-SECRETISIMA-1234'
const entorno = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_xyz',
  GEMINI_API_KEY: CLAVE,
  PRESUPUESTO_MENSUAL_USD: '10',
}

const MOTO = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0x11, 0x22, 0xff, 0xd9])
const REFERENCIA = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x99, 0x98, 0xff, 0xd9])
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x04, 0x80, 0x03, 0x80, 0x01, 0, 0, 0, 0xff, 0xd9])
const imagenOk = () =>
  Response.json({
    status: 'completed',
    steps: [{ type: 'model_output', content: [{ type: 'image', data: Buffer.from(JPEG).toString('base64'), mime_type: 'image/jpeg' }] }],
    usage: { total_input_tokens: 2400, total_output_tokens: 1120, output_tokens_by_modality: [{ modality: 'image', tokens: 1120 }] },
  })

// 0,0336 + (1500 + 2 × 1120) × 1,5 / 1e6 + 1000 × 7,5 / 1e6 = 0,04671 por imagen
const COSTO_CON_REFERENCIA = 0.09342
const COSTO_SIN_REFERENCIA = 0.09006
const gen = (o: Record<string, unknown> = {}) => ({
  id: GEN_ID,
  estado: 'estimada',
  motor: 'gemini-nano-banana-2.1',
  cantidad: 2,
  aspecto: '4:5',
  prompt: 'Editá esta foto real de una moto',
  pieza_id: null,
  pieza_raiz_id: null,
  foto_id: FOTO_ID,
  referencia_foto_id: REF_ID,
  costo_estimado_usd: COSTO_CON_REFERENCIA,
  ...o,
})

type Mundo = { gen?: Record<string, unknown>; ref?: 'ok' | 'inexistente' | 'borrada'; descargaRef?: number }
function mundo(o: Mundo = {}) {
  const log: string[] = []
  const gemini: any[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    const metodo = init?.method ?? 'GET'
    if (url.hostname === 'generativelanguage.googleapis.com') {
      gemini.push(JSON.parse(String(init!.body)))
      log.push('gemini')
      return imagenOk()
    }
    if (url.pathname === '/rest/v1/miembros') return Response.json([{ rol: 'director' }])
    if (url.pathname === '/rest/v1/generaciones' && metodo === 'GET') return Response.json([o.gen ?? gen()])
    if (url.pathname === '/rest/v1/generaciones' && metodo === 'PATCH') return new Response(null, { status: 204 })
    if (url.pathname === '/rest/v1/fotos') {
      expect(url.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
      if (url.searchParams.get('id') === `eq.${REF_ID}`) {
        // La referencia se busca como foto de INSPIRACIÓN.
        expect(url.searchParams.get('uso')).toBe('eq.inspiracion')
        log.push('ref:leer')
        if (o.ref === 'inexistente') return Response.json([])
        return Response.json([{ ruta: o.ref === 'borrada' ? null : RUTA_REF, borrada_en: o.ref === 'borrada' ? '2026-10-26T10:00:00Z' : null }])
      }
      log.push('foto:leer')
      return Response.json([{ ruta: RUTA, borrada_en: null }])
    }
    if (url.pathname.startsWith('/storage/v1/object/authenticated/fotos/')) {
      if (url.pathname.endsWith(RUTA_REF)) {
        log.push('ref:descargar')
        return o.descargaRef ? new Response('{"message":"x"}', { status: o.descargaRef }) : new Response(REFERENCIA, { status: 200 })
      }
      log.push('foto:descargar')
      return new Response(MOTO, { status: 200 })
    }
    if (url.pathname === '/rest/v1/rpc/confirmar_generacion') {
      log.push('rpc:confirmar')
      return Response.json({})
    }
    if (url.pathname === '/rest/v1/rpc/gasto_generaciones_mes') return Response.json(0)
    if (url.pathname.startsWith('/storage/v1/object/sign/creativos')) {
      const { paths } = JSON.parse(String(init!.body))
      return Response.json(paths.map((p: string) => ({ path: p, signedURL: `/object/sign/creativos/${p}?token=T`, error: null })))
    }
    if (url.pathname.startsWith('/storage/v1/object/creativos/')) return new Response('{}', { status: 200 })
    if (url.pathname === '/rest/v1/creativos' && metodo === 'POST') {
      const cuerpo = JSON.parse(String(init!.body))
      return Response.json([{ id: `c-${cuerpo.orden}`, ...cuerpo }])
    }
    throw new Error(`URL inesperada: ${metodo} ${url}`)
  })
  return { f, log, gemini }
}
const pedido = () =>
  new Request(`https://app.ejemplo.com/api/generaciones/${GEN_ID}/confirmar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [HEADER_USUARIO]: 'u-1' },
    body: '{}',
  })
const confirmar = (m: ReturnType<typeof mundo>) => manejarConfirmacion(pedido(), GEN_ID, entorno, m.f)
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64')

describe('confirmar una escena con foto de inspiración', () => {
  it('descarga la moto Y la referencia ANTES de la compuerta y manda la moto primero, la referencia segunda', async () => {
    const m = mundo()
    const r = await confirmar(m)
    expect(r.status).toBe(200)
    const iRpc = m.log.indexOf('rpc:confirmar')
    expect(m.log.indexOf('foto:descargar')).toBeLessThan(iRpc)
    expect(m.log.indexOf('ref:descargar')).toBeLessThan(iRpc)
    expect(iRpc).toBeLessThan(m.log.indexOf('gemini'))
    expect(m.gemini).toHaveLength(2)
    for (const cuerpo of m.gemini) {
      expect(cuerpo.input).toEqual([
        { type: 'text', text: 'Editá esta foto real de una moto' },
        { type: 'image', mime_type: 'image/jpeg', data: b64(MOTO) },
        { type: 'image', mime_type: 'image/jpeg', data: b64(REFERENCIA) },
      ])
      expect(cuerpo.store).toBe(false)
    }
  })

  it('el costo de la referencia entra al tope: coincide con la estimación y la respuesta no lleva la clave ni el base64', async () => {
    const m = mundo()
    const r = await confirmar(m)
    const texto = await r.text()
    expect(JSON.parse(texto).generacion.costoEstimadoUsd).toBe(COSTO_CON_REFERENCIA)
    expect(texto).not.toContain(CLAVE)
    expect(texto).not.toContain(b64(REFERENCIA))
  })

  it('si la estimación no incluía la referencia (precio viejo), 409 sin RPC ni Gemini', async () => {
    const m = mundo({ gen: gen({ costo_estimado_usd: COSTO_SIN_REFERENCIA }) })
    const r = await confirmar(m)
    expect(r.status).toBe(409)
    expect(m.log).not.toContain('rpc:confirmar')
    expect(m.gemini).toHaveLength(0)
  })

  it('referencia inexistente 404 y borrada 410: cero RPC y cero llamadas a Gemini', async () => {
    const a = mundo({ ref: 'inexistente' })
    expect((await confirmar(a)).status).toBe(404)
    const b = mundo({ ref: 'borrada' })
    expect((await confirmar(b)).status).toBe(410)
    for (const m of [a, b]) {
      expect(m.log).not.toContain('rpc:confirmar')
      expect(m.gemini).toHaveLength(0)
    }
  })

  it('si Storage no entrega la referencia: 500 sin cobrar ni llamar a Gemini', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = mundo({ descargaRef: 500 })
    const r = await confirmar(m)
    expect(r.status).toBe(500)
    expect(m.log).not.toContain('rpc:confirmar')
    expect(m.gemini).toHaveLength(0)
    spy.mockRestore()
  })

  it('una generación sin referencia sigue igual: dos partes y el precio de siempre', async () => {
    const m = mundo({ gen: gen({ referencia_foto_id: null, costo_estimado_usd: COSTO_SIN_REFERENCIA }) })
    const r = await confirmar(m)
    expect(r.status).toBe(200)
    expect(m.log).not.toContain('ref:leer')
    expect(m.gemini[0].input).toHaveLength(2)
  })
})

describe('de punta a punta: la hija de una tanda con inspiración (el caso de producción)', () => {
  const ID_PROMO = '22222222-2222-4222-8222-222222222222'
  const ID_TANDA = '55555555-5555-4555-8555-555555555555'
  it('estimar por promocionId guarda la referencia de LA HIJA y confirmar manda DOS imágenes a Gemini (moto y referencia)', async () => {
    const inserts: Record<string, any>[] = []
    const fEst = vi.fn<typeof fetch>(async (u, init) => {
      const url = new URL(String(u))
      if (url.hostname.includes('googleapis')) throw new Error('Gemini no se llama al estimar')
      if (url.pathname === '/rest/v1/miembros') return Response.json([{ rol: 'director' }])
      if (url.pathname === '/rest/v1/promociones') {
        // Se lee la HIJA por su id, no la tanda.
        expect(url.searchParams.get('id')).toBe(`eq.${ID_PROMO}`)
        return Response.json([
          filaPromocion({ id: ID_PROMO, tanda_id: ID_TANDA, foto_id: FOTO_ID, plantilla: 'oferta_abajo', fondo: 'solo_descripcion', fondo_descripcion: 'foto de noche en puerto madero.', posicion_moto: 'izquierda', inspiracion_foto_id: REF_ID, aspecto: '4:5' } as never),
        ])
      }
      if (url.pathname === '/rest/v1/fotos') return Response.json([{ id: url.searchParams.get('id')!.slice(3), ruta: 'org/x.jpg', borrada_en: null }])
      if (url.pathname === '/rest/v1/rpc/gasto_generaciones_mes') return Response.json(0)
      if (url.pathname === '/rest/v1/generaciones' && init?.method === 'POST') {
        const cuerpo = JSON.parse(String(init.body))
        inserts.push(cuerpo)
        return Response.json([{ id: GEN_ID, ...cuerpo }])
      }
      throw new Error(`URL inesperada: ${url}`)
    })
    const estimada = await manejarEstimacion(
      new Request('https://app.ejemplo.com/api/generaciones', { method: 'POST', headers: { 'content-type': 'application/json', [HEADER_USUARIO]: 'u-1' }, body: JSON.stringify({ promocionId: ID_PROMO, cantidad: 2 }) }),
      entorno,
      fEst,
    )
    expect(estimada.status).toBe(201)
    const fila = inserts[0]!
    expect(fila).toMatchObject({ foto_id: FOTO_ID, referencia_foto_id: REF_ID, costo_estimado_usd: COSTO_CON_REFERENCIA })

    const m = mundo({ gen: { id: GEN_ID, estado: 'estimada', pieza_id: null, pieza_raiz_id: null, ...fila } })
    expect((await confirmar(m)).status).toBe(200)
    expect(m.gemini).toHaveLength(2)
    for (const cuerpo of m.gemini) {
      expect(cuerpo.input).toHaveLength(3)
      expect(cuerpo.input[0].text).toContain('«foto de noche en puerto madero.»')
      expect(cuerpo.input[0].text).not.toContain('gris claro')
      expect(cuerpo.input[1]).toEqual({ type: 'image', mime_type: 'image/jpeg', data: b64(MOTO) })
      expect(cuerpo.input[2]).toEqual({ type: 'image', mime_type: 'image/jpeg', data: b64(REFERENCIA) })
    }
  })
})
