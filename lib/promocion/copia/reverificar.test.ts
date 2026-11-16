import { describe, it, expect, vi } from 'vitest'
import { manejarReverificacion } from './reverificar'
import { estimarVerificacion } from './precios'
import { HEADER_USUARIO } from '../../auth/acceso'
import { ORGANIZACION_PILOTO_ID } from '../../organizacion'
import type { TextosCopia } from './tipos'

const ID = '66666666-6666-4666-8666-666666666666'
const ID_GEN = '77777777-7777-4777-8777-777777777777'
const RUTA = `${ORGANIZACION_PILOTO_ID}/${ID_GEN}/1.jpg`
const CLAVE = 'AIza-SECRETISIMA-1234'
const entorno = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_xyz', GEMINI_API_KEY: CLAVE, PRESUPUESTO_MENSUAL_USD: '10' }
const MODELO = 'gemini-4-argon'
const PRECIO = estimarVerificacion(MODELO).topeUsd
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x04, 0x80, 0x03, 0x80, 0x01, 0, 0, 0, 0xff, 0xd9])
const textos: TextosCopia = { modelo: 'ROUSER 200', precio: '$ 4.500.000', condicion: null, frase: null, cta: null, lugar: null, negocio: null, logo: 'real', ocultos: [] }
const lectura = (precio = '$ 4.500.000') => ({ textos: [{ texto: 'ROUSER 200', rol: 'modelo', dudoso: false }, { texto: precio, rol: 'precio', dudoso: false }], logo: null, fondo_logo: 'claro' })
const vision = (l: unknown = lectura()) =>
  Response.json({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(l) }] }], usage: { total_input_tokens: 2000, total_output_tokens: 300, total_thought_tokens: 100 } })

type Mundo = {
  rol?: string | null
  creativo?: Record<string, unknown> | null
  gen?: Record<string, unknown> | null
  descarga?: number
  reservar?: () => Response
  gemini?: () => Response
}
function mundo(o: Mundo = {}) {
  const log: string[] = []
  const gemini: any[] = []
  const reservas: any[] = []
  const cierres: any[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    const metodo = init?.method ?? 'GET'
    if (url.hostname === 'generativelanguage.googleapis.com') {
      gemini.push(JSON.parse(String(init!.body)))
      log.push('gemini')
      return (o.gemini ?? (() => vision()))()
    }
    if (url.pathname === '/rest/v1/miembros') return Response.json(o.rol === null ? [] : [{ rol: o.rol ?? 'director' }])
    if (url.pathname === '/rest/v1/creativos') {
      expect(url.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
      return Response.json(o.creativo === null ? [] : [{ id: ID, generacion_id: ID_GEN, ruta: RUTA, mime_type: 'image/jpeg', ...o.creativo }])
    }
    if (url.pathname === '/rest/v1/generaciones') {
      return Response.json(o.gen === null ? [] : [{ id: ID_GEN, textos_esperados: textos, textos_hash: 'a'.repeat(64), modelo_verificacion: MODELO, ...o.gen }])
    }
    if (url.pathname.startsWith('/storage/v1/object/authenticated/creativos/')) {
      log.push('descargar')
      return o.descarga ? new Response('{"message":"x"}', { status: o.descarga }) : new Response(JPEG, { status: 200 })
    }
    if (url.pathname === '/rest/v1/rpc/reservar_verificacion_texto') {
      log.push('rpc:reservar')
      reservas.push(JSON.parse(String(init!.body)))
      return (o.reservar ?? (() => Response.json({ id: 'ver-9' })))()
    }
    if (url.pathname === '/rest/v1/rpc/cerrar_verificacion_texto') {
      log.push('rpc:cerrar')
      cierres.push(JSON.parse(String(init!.body)))
      return Response.json({})
    }
    if (url.pathname === '/rest/v1/rpc/gasto_generaciones_mes') return Response.json(9.99)
    throw new Error(`URL inesperada: ${metodo} ${url}`)
  })
  return { f, log, gemini, reservas, cierres }
}
const pedido = (cuerpo: unknown = { aceptadoUsd: PRECIO }, usuario: string | null = 'u-1') =>
  new Request(`https://app.ejemplo.com/api/creativos/${ID}/verificacion`, { method: 'POST', headers: { 'content-type': 'application/json', ...(usuario ? { [HEADER_USUARIO]: usuario } : {}) }, body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) })
const llamar = (m: ReturnType<typeof mundo>, cuerpo?: unknown, e: Record<string, string> = entorno, usuario: string | null = 'u-1') => manejarReverificacion(pedido(cuerpo, usuario), ID, e, m.f)
const sinEfectos = (m: ReturnType<typeof mundo>) => {
  expect(m.gemini).toHaveLength(0)
  expect(m.log).not.toContain('rpc:reservar')
}

describe('re-verificar: acceso', () => {
  it('sin sesión 401; lector 403 y no-miembro 403: cero llamadas', async () => {
    const a = mundo()
    expect((await llamar(a, undefined, entorno, null)).status).toBe(401)
    for (const rol of ['lector', null]) {
      const m = mundo({ rol })
      expect((await llamar(m)).status).toBe(403)
      sinEfectos(m)
    }
    sinEfectos(a)
  })
  it('sin clave de Gemini o sin tope: 503', async () => {
    for (const e of [{ ...entorno, GEMINI_API_KEY: '' }, { ...entorno, PRESUPUESTO_MENSUAL_USD: '' }]) {
      const m = mundo()
      expect((await llamar(m, undefined, e)).status).toBe(503)
      sinEfectos(m)
    }
  })
  it('el operador actúa', async () => expect((await llamar(mundo({ rol: 'operador' }))).status).toBe(200))
})

describe('re-verificar: el pedido', () => {
  it('un id inválido es 404; un cuerpo inválido o sin precio aceptado es 400', async () => {
    const m = mundo()
    expect((await manejarReverificacion(pedido(), 'abc', entorno, m.f)).status).toBe(404)
    for (const c of ['no json', '[]', {}, { aceptadoUsd: 'x' }, { aceptadoUsd: -1 }]) expect((await llamar(mundo(), c)).status).toBe(400)
    sinEfectos(m)
  })
  it('la imagen tiene que ser de la organización (404) y estar guardada (410)', async () => {
    const a = mundo({ creativo: null })
    expect((await llamar(a)).status).toBe(404)
    const b = mundo({ creativo: { ruta: null } })
    expect((await llamar(b)).status).toBe(410)
    sinEfectos(a)
    sinEfectos(b)
  })
  it('una imagen que NO es de copia fiel: 422', async () => {
    const m = mundo({ gen: { textos_esperados: null, textos_hash: null, modelo_verificacion: null } })
    expect((await llamar(m)).status).toBe(422)
    sinEfectos(m)
  })
  it('el precio que aceptó no coincide con el del servidor: 409, sin reservar ni llamar', async () => {
    const m = mundo()
    const r = await llamar(m, { aceptadoUsd: 0.01 })
    expect(r.status).toBe(409)
    expect((await r.json()).error).toMatch(/precio cambió/)
    sinEfectos(m)
  })
  it('un modelo de revisión sin precio: 500 sin llamar a nadie', async () => {
    const m = mundo({ gen: { modelo_verificacion: 'modelo-x' } })
    expect((await llamar(m)).status).toBe(500)
    sinEfectos(m)
  })
})

describe('re-verificar: la compuerta propia (orden inviolable)', () => {
  it('descarga la imagen ANTES de reservar y reserva ANTES de llamar a Gemini', async () => {
    const m = mundo()
    await llamar(m)
    expect(m.log).toEqual(['descargar', 'rpc:reservar', 'gemini', 'rpc:cerrar'])
  })
  it('si Storage falla no queda nada reservado', async () => {
    const m = mundo({ descarga: 500 })
    expect((await llamar(m)).status).toBe(500)
    sinEfectos(m)
  })
  it('reserva con el precio del servidor, el tope y el usuario', async () => {
    const m = mundo()
    await llamar(m)
    expect(m.reservas[0]).toMatchObject({ p_org: ORGANIZACION_PILOTO_ID, p_creativo: ID, p_modelo: MODELO, p_estimado: PRECIO, p_tope: 10, p_usuario: 'u-1' })
  })
  it('402 (tope mensual): CERO llamadas a Gemini y dice lo que falta', async () => {
    const m = mundo({ reservar: () => new Response('{"message":"x"}', { status: 402 }) })
    const r = await llamar(m)
    expect(r.status).toBe(402)
    expect(await r.json()).toMatchObject({ error: 'Supera el tope mensual.', estimadoUsd: PRECIO })
    expect(m.gemini).toHaveLength(0)
  })
  it("409 por 'ya se revisó' o 'ya se está revisando' (doble click): cero llamadas a Gemini, con su mensaje", async () => {
    const a = mundo({ reservar: () => new Response('{"message":"Esta imagen ya se revisó"}', { status: 409 }) })
    const ra = await llamar(a)
    expect(ra.status).toBe(409)
    expect((await ra.json()).error).toMatch(/ya se revisó/)
    const b = mundo({ reservar: () => new Response('{"message":"Ya se están revisando los textos de esta imagen"}', { status: 409 }) })
    const rb = await llamar(b)
    expect(rb.status).toBe(409)
    expect((await rb.json()).error).toMatch(/revisando/)
    expect(a.gemini.length + b.gemini.length).toBe(0)
  })
  it('404 y 422 de la RPC se traducen', async () => {
    for (const st of [404, 422]) {
      const m = mundo({ reservar: () => new Response('{"message":"x"}', { status: st }) })
      expect((await llamar(m)).status).toBe(st)
      expect(m.gemini).toHaveLength(0)
    }
  })
})

describe('re-verificar: el resultado', () => {
  it('ok: devuelve la verificación y el costo real; cierra la fila reservada (cobro propio, no inserta otra)', async () => {
    const m = mundo()
    const r = await llamar(m)
    const b = await r.json()
    expect(b.verificacion).toMatchObject({ estado: 'ok', diferencias: [], puedeReverificar: false })
    expect(b.costoUsd).toBeCloseTo((2000 * 4 + 400 * 20) / 1e6, 8)
    expect(m.cierres[0].p_id).toBe('ver-9')
  })
  it("difiere: las diferencias llegan a la pantalla y no se ofrece re-verificar (se regenera)", async () => {
    const m = mundo({ gemini: () => vision(lectura('$ 4.500.00')) })
    const b = await (await llamar(m)).json()
    expect(b.verificacion.estado).toBe('difiere')
    expect(b.verificacion.diferencias[0]).toMatchObject({ campo: 'precio', motivo: 'distinto' })
    expect(b.verificacion.puedeReverificar).toBe(false)
  })
  it('error del verificador: se informa, se ofrece volver a revisar con su precio', async () => {
    const m = mundo({ gemini: () => Response.json({ error: { message: 'boom' } }, { status: 500 }) })
    const b = await (await llamar(m)).json()
    expect(b.verificacion).toMatchObject({ estado: 'error', puedeReverificar: true, costoReverificarUsd: PRECIO })
    expect(b.costoUsd).toBe(0)
  })
  it('la clave nunca aparece en la respuesta', async () => {
    const m = mundo({ gemini: () => Response.json({ error: { message: `x ${CLAVE}` } }, { status: 400 }) })
    expect(await (await llamar(m)).text()).not.toContain(CLAVE)
  })
})
