import { describe, it, expect, vi } from 'vitest'
import { HEADER_USUARIO } from '../auth/acceso'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { manejarConfirmacion } from './confirmar'
import { estimarImagenes } from './precios'

const GEN_ID = '44444444-4444-4444-8444-444444444444'
const FOTO_ID = '77777777-7777-4777-8777-777777777777'
const BASE_ID = '55555555-5555-4555-8555-555555555555'
const RUTA_FOTO = `${ORGANIZACION_PILOTO_ID}/${FOTO_ID}.jpg`
const RUTA_BASE = `${ORGANIZACION_PILOTO_ID}/gen-base/1.png`
const CLAVE = 'AIza-SECRETISIMA-1234'
const entorno = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_xyz',
  GEMINI_API_KEY: CLAVE,
  PRESUPUESTO_MENSUAL_USD: '10',
}
const MOTO = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0x11, 0x22, 0xff, 0xd9])
const BASE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01])
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x04, 0x80, 0x03, 0x80, 0x01, 0, 0, 0, 0xff, 0xd9])
const imagenOk = () =>
  Response.json({
    status: 'completed',
    steps: [{ type: 'model_output', content: [{ type: 'image', data: Buffer.from(JPEG).toString('base64'), mime_type: 'image/jpeg' }] }],
    usage: { total_input_tokens: 2400, total_output_tokens: 1120, output_tokens_by_modality: [{ modality: 'image', tokens: 1120 }] },
  })

const COSTO_CON_FOTO = estimarImagenes('gemini-nano-banana-2.1', 1, { imagenesEntrada: 2 }).topeTotalUsd
const COSTO_SIN_FOTO = estimarImagenes('gemini-nano-banana-2.1', 1, { imagenesEntrada: 1 }).topeTotalUsd
const gen = (o: Record<string, unknown> = {}) => ({
  id: GEN_ID,
  estado: 'estimada',
  motor: 'gemini-nano-banana-2.1',
  cantidad: 1,
  aspecto: '4:5',
  prompt: 'Editá la PRIMERA imagen',
  pieza_id: null,
  pieza_raiz_id: null,
  foto_id: FOTO_ID,
  referencia_foto_id: null,
  base_creativo_id: BASE_ID,
  costo_estimado_usd: COSTO_CON_FOTO,
  ...o,
})

type Mundo = { gen?: Record<string, unknown>; base?: 'ok' | 'inexistente' | 'sinRuta'; descargaBase?: number; foto?: 'ok' | 'borrada' }
function mundo(o: Mundo = {}) {
  const log: string[] = []
  const gemini: any[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    const metodo = init?.method ?? 'GET'
    if (url.hostname === 'generativelanguage.googleapis.com') {
      gemini.push(JSON.parse(String(init!.body)))
      log.push('gemini')
      expect(JSON.stringify(init!.headers)).toContain(CLAVE)
      expect(String(u)).not.toContain(CLAVE)
      expect(String(init!.body)).not.toContain(CLAVE)
      return imagenOk()
    }
    if (url.pathname === '/rest/v1/miembros') return Response.json([{ rol: 'director' }])
    if (url.pathname === '/rest/v1/generaciones' && metodo === 'GET') return Response.json([o.gen ?? gen()])
    if (url.pathname === '/rest/v1/generaciones' && metodo === 'PATCH') return new Response(null, { status: 204 })
    if (url.pathname === '/rest/v1/creativos' && metodo === 'GET') {
      expect(url.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
      expect(url.searchParams.get('id')).toBe(`eq.${BASE_ID}`)
      log.push('base:leer')
      if (o.base === 'inexistente') return Response.json([])
      return Response.json([{ ruta: o.base === 'sinRuta' ? null : RUTA_BASE, mime_type: 'image/png' }])
    }
    if (url.pathname === '/rest/v1/fotos') {
      log.push('foto:leer')
      return Response.json([{ ruta: o.foto === 'borrada' ? null : RUTA_FOTO, borrada_en: o.foto === 'borrada' ? '2026-10-26T10:00:00Z' : null }])
    }
    if (url.pathname === `/storage/v1/object/authenticated/creativos/${RUTA_BASE}`) {
      log.push('base:descargar')
      return o.descargaBase ? new Response('{"message":"x"}', { status: o.descargaBase }) : new Response(BASE, { status: 200 })
    }
    if (url.pathname.startsWith('/storage/v1/object/authenticated/fotos/')) {
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
const confirmar = (m: ReturnType<typeof mundo>) =>
  manejarConfirmacion(
    new Request(`https://app.ejemplo.com/api/generaciones/${GEN_ID}/confirmar`, { method: 'POST', headers: { [HEADER_USUARIO]: 'u-1' }, body: '{}' }),
    GEN_ID,
    entorno,
    m.f,
  )
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64')

describe('confirmar un cambio de imagen', () => {
  it('descarga la base y la foto ANTES de la compuerta; Gemini recibe [prompt, base, foto] en ese orden, sin la clave en el body', async () => {
    const m = mundo()
    const r = await confirmar(m)
    expect(r.status).toBe(200)
    const iRpc = m.log.indexOf('rpc:confirmar')
    expect(m.log.indexOf('base:descargar')).toBeLessThan(iRpc)
    expect(m.log.indexOf('foto:descargar')).toBeLessThan(iRpc)
    expect(iRpc).toBeLessThan(m.log.indexOf('gemini'))
    expect(m.gemini).toHaveLength(1)
    expect(m.gemini[0].input).toEqual([
      { type: 'text', text: 'Editá la PRIMERA imagen' },
      { type: 'image', mime_type: 'image/png', data: b64(BASE) },
      { type: 'image', mime_type: 'image/jpeg', data: b64(MOTO) },
    ])
    expect(m.gemini[0].store).toBe(false)
    const texto = await r.text()
    expect(texto).not.toContain(CLAVE)
    expect(texto).not.toContain(b64(BASE))
  })

  it('sin foto real (pieza): solo la base como imagen de entrada', async () => {
    const m = mundo({ gen: gen({ foto_id: null, pieza_id: 'p', pieza_raiz_id: 'r', costo_estimado_usd: COSTO_SIN_FOTO }) })
    const r = await confirmar(m)
    expect(r.status).toBe(200)
    expect(m.gemini[0].input).toEqual([
      { type: 'text', text: 'Editá la PRIMERA imagen' },
      { type: 'image', mime_type: 'image/png', data: b64(BASE) },
    ])
  })

  it('recalcula el precio con las 2 imágenes de entrada: si no coincide, 409 sin RPC ni Gemini', async () => {
    const m = mundo({ gen: gen({ costo_estimado_usd: COSTO_SIN_FOTO }) })
    const r = await confirmar(m)
    expect(r.status).toBe(409)
    expect(m.log).not.toContain('rpc:confirmar')
    expect(m.gemini).toHaveLength(0)
  })

  it.each([
    ['la base no existe', { base: 'inexistente' }, 404],
    ['la base no tiene imagen guardada', { base: 'sinRuta' }, 410],
    ['la foto original se borró', { foto: 'borrada' }, 410],
  ] as const)('%s: sin RPC ni Gemini', async (_n, o, status) => {
    const m = mundo(o)
    const r = await confirmar(m)
    expect(r.status).toBe(status)
    expect(m.log).not.toContain('rpc:confirmar')
    expect(m.gemini).toHaveLength(0)
  })

  it('si Storage falla al bajar la base: 500, no se confirma nada', async () => {
    const m = mundo({ descargaBase: 500 })
    const r = await confirmar(m)
    expect(r.status).toBe(500)
    expect(m.log).not.toContain('rpc:confirmar')
    expect(m.gemini).toHaveLength(0)
  })
})
