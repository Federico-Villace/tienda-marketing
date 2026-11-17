import { describe, it, expect, vi } from 'vitest'
import { HEADER_USUARIO } from '../auth/acceso'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { manejarConfirmacion } from './confirmar'
import { estimarCopiaFiel, imagenesDeEntradaCopia } from '../promocion/copia/precios'
import { hashTextos } from '../promocion/copia/hash-textos'
import type { TextosCopia } from '../promocion/copia/tipos'

const GEN_ID = '44444444-4444-4444-8444-444444444444'
const F1 = '77777777-7777-4777-8777-777777777777'
const F2 = '22222222-2222-4222-8222-222222222222'
const F3 = '33333333-3333-4333-8333-333333333333'
const REF_ID = '88888888-8888-4888-8888-888888888888'
const ruta = (id: string) => `${ORGANIZACION_PILOTO_ID}/${id}.jpg`
const CLAVE = 'AIza-SECRETISIMA-1234'
const entorno = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_xyz', GEMINI_API_KEY: CLAVE, PRESUPUESTO_MENSUAL_USD: '10' }
const PRO = 'gemini-3-pro-image'
const MODELO_V = 'gemini-4-argon'

const BYTES: Record<string, Uint8Array<ArrayBuffer>> = {
  [F1]: Uint8Array.from([0xff, 0xd8, 0xff, 0x01]),
  [F2]: Uint8Array.from([0xff, 0xd8, 0xff, 0x02]),
  [F3]: Uint8Array.from([0xff, 0xd8, 0xff, 0x03]),
  [REF_ID]: Uint8Array.from([0xff, 0xd8, 0xff, 0x09]),
}
const b64 = (id: string) => Buffer.from(BYTES[id]!).toString('base64')
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x04, 0x80, 0x03, 0x80, 0x01, 0, 0, 0, 0xff, 0xd9])
const imagenOk = () =>
  Response.json({
    status: 'completed',
    steps: [{ type: 'model_output', content: [{ type: 'image', data: Buffer.from(JPEG).toString('base64'), mime_type: 'image/jpeg' }] }],
    usage: { total_input_tokens: 3400, total_output_tokens: 1120, output_tokens_by_modality: [{ modality: 'image', tokens: 1120 }] },
  })

const M1 = { modelo: 'ROUSER 200', precio: '$ 4.500.000', condicion: null }
const M2 = { modelo: 'LEONCINO 500', precio: '$ 7.000.000', condicion: null }
const M3 = { modelo: 'TRK 502', precio: '$ 9.200.000', condicion: null }
const textos = (motos = [M1, M2, M3]): TextosCopia => ({ motos, modelo: null, precio: null, condicion: null, frase: 'Elegí la tuya', cta: 'Consultanos', lugar: 'Quilmes', negocio: null, logo: 'real', ocultos: [] })
const lectura = (motos = [M1, M2, M3]) => ({
  textos: [
    ...motos.flatMap((m) => [{ texto: m.modelo, rol: 'modelo', dudoso: false }, { texto: m.precio, rol: 'precio', dudoso: false }]),
    { texto: 'Elegí la tuya', rol: 'frase', dudoso: false }, { texto: 'CONSULTANOS', rol: 'cta', dudoso: false }, { texto: 'Quilmes', rol: 'lugar', dudoso: false },
  ],
  logo: { x: 0.3, y: 0.02, w: 0.4, h: 0.08 }, fondo_logo: 'oscuro',
})
const visionOk = (l: unknown = lectura()) =>
  Response.json({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(l) }] }], usage: { total_input_tokens: 2000, total_output_tokens: 300, total_thought_tokens: 100 } })

const COSTO = (motos: number, cantidad = 1) => estimarCopiaFiel(PRO, cantidad, MODELO_V, imagenesDeEntradaCopia(motos)).topeTotalUsd
const gen = (o: Record<string, unknown> = {}) => ({
  id: GEN_ID, estado: 'estimada', motor: PRO, cantidad: 1, aspecto: '4:5', prompt: 'Hacé una placa de varias motos', pieza_id: null, pieza_raiz_id: null, foto_id: F1, referencia_foto_id: REF_ID,
  costo_estimado_usd: COSTO(3), textos_esperados: textos(), textos_hash: hashTextos(textos()), modelo_verificacion: MODELO_V, parametros: { aspecto: '4:5', fotosExtra: [F2, F3] }, ...o,
})

type Mundo = { gen?: Record<string, unknown>; confirmar?: () => Response; foto?: (id: string) => 'viva' | 'borrada' | 'inexistente'; vision?: () => Response }
function mundo(o: Mundo = {}) {
  const log: string[] = []
  const imagenes: any[] = []
  const visiones: any[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    const metodo = init?.method ?? 'GET'
    if (url.hostname === 'generativelanguage.googleapis.com') {
      const cuerpo = JSON.parse(String(init!.body))
      if (cuerpo.model === MODELO_V) {
        visiones.push(cuerpo)
        log.push('vision')
        return (o.vision ?? (() => visionOk()))()
      }
      imagenes.push(cuerpo)
      log.push('imagen')
      return imagenOk()
    }
    if (url.pathname === '/rest/v1/miembros') return Response.json([{ rol: 'director' }])
    if (url.pathname === '/rest/v1/generaciones' && metodo === 'GET') return Response.json([o.gen ?? gen()])
    if (url.pathname === '/rest/v1/generaciones' && metodo === 'PATCH') return new Response(null, { status: 204 })
    if (url.pathname === '/rest/v1/fotos') {
      const filtro = url.searchParams.get('id') ?? ''
      const ids = filtro.startsWith('in.(') ? filtro.slice(4, -1).split(',') : [filtro.replace('eq.', '')]
      if (filtro.startsWith('in.(')) {
        if (url.searchParams.get('uso') !== 'eq.moto') throw new Error('las fotos de las motos se buscan con uso=moto')
        log.push('extras:leer')
      } else log.push(ids[0] === REF_ID ? 'ref:leer' : 'foto:leer')
      const estados = ids.map((id) => ({ id, estado: (o.foto ?? (() => 'viva' as const))(id) }))
      // Responde en orden INVERSO a propósito: el orden de las motos no puede depender del de la respuesta.
      return Response.json(
        estados
          .filter((x) => x.estado !== 'inexistente')
          .map((x) => ({ id: x.id, ruta: x.estado === 'borrada' ? null : ruta(x.id), borrada_en: x.estado === 'borrada' ? '2026-10-20T00:00:00Z' : null }))
          .reverse(),
      )
    }
    if (url.pathname.startsWith('/storage/v1/object/authenticated/fotos/')) {
      const id = Object.keys(BYTES).find((k) => url.pathname.endsWith(ruta(k)))!
      log.push(`descargar:${id === F1 ? 'm1' : id === F2 ? 'm2' : id === F3 ? 'm3' : 'ref'}`)
      return new Response(BYTES[id]!, { status: 200 })
    }
    if (url.pathname === '/rest/v1/rpc/confirmar_generacion') {
      log.push('rpc:confirmar')
      return (o.confirmar ?? (() => Response.json({})))()
    }
    if (url.pathname === '/rest/v1/rpc/gasto_generaciones_mes') return Response.json(0)
    if (url.pathname.startsWith('/storage/v1/object/sign/creativos')) {
      const { paths } = JSON.parse(String(init!.body))
      return Response.json(paths.map((p: string) => ({ path: p, signedURL: `/object/sign/creativos/${p}?token=T`, error: null })))
    }
    if (url.pathname.startsWith('/storage/v1/object/creativos/')) return new Response('{}', { status: 200 })
    if (url.pathname === '/rest/v1/creativos' && metodo === 'POST') {
      const c = JSON.parse(String(init!.body))
      return Response.json([{ id: `c-${c.orden}`, ...c }])
    }
    if (url.pathname === '/rest/v1/verificaciones_texto' && metodo === 'POST') return Response.json([{ id: 'v-1' }], { status: 201 })
    if (url.pathname === '/rest/v1/rpc/cerrar_verificacion_texto') return Response.json({})
    throw new Error(`URL inesperada: ${metodo} ${url}`)
  })
  return { f, log, imagenes, visiones }
}
const pedido = () => new Request(`https://app.ejemplo.com/api/generaciones/${GEN_ID}/confirmar`, { method: 'POST', headers: { 'content-type': 'application/json', [HEADER_USUARIO]: 'u-1' }, body: '{}' })
const confirmar = (m: ReturnType<typeof mundo>) => manejarConfirmacion(pedido(), GEN_ID, entorno, m.f)

describe('confirmar una copia fiel de varias motos', () => {
  it('Gemini recibe [texto, moto 1, moto 2, moto 3, referencia] en ESE orden', async () => {
    const m = mundo()
    const r = await confirmar(m)
    expect(r.status).toBe(200)
    expect(m.imagenes).toHaveLength(1)
    const imgs = m.imagenes[0].input.filter((x: { type: string }) => x.type === 'image').map((x: { data: string }) => x.data)
    expect(imgs).toEqual([b64(F1), b64(F2), b64(F3), b64(REF_ID)])
    expect(m.imagenes[0].input[0]).toEqual({ type: 'text', text: 'Hacé una placa de varias motos' })
  })
  it('todas las fotos se leen y se descargan ANTES de la compuerta; una sola vez cada una', async () => {
    const m = mundo()
    await confirmar(m)
    const compuerta = m.log.indexOf('rpc:confirmar')
    for (const paso of ['descargar:m1', 'descargar:m2', 'descargar:m3', 'descargar:ref', 'extras:leer']) {
      expect(m.log.indexOf(paso), paso).toBeGreaterThanOrEqual(0)
      expect(m.log.indexOf(paso), paso).toBeLessThan(compuerta)
      expect(m.log.filter((x) => x === paso)).toHaveLength(1)
    }
    expect(m.log.indexOf('imagen')).toBeGreaterThan(compuerta)
  })
  it('revisa los textos de cada moto una vez, a ciegas: el pedido al revisor no lleva ningún modelo ni precio', async () => {
    const m = mundo()
    await confirmar(m)
    expect(m.visiones).toHaveLength(1)
    const pedidoVision = JSON.stringify(m.visiones[0])
    for (const x of ['ROUSER', 'LEONCINO', 'TRK', '4.500.000', '7.000.000']) expect(pedidoVision).not.toContain(x)
  })
  it('un precio que falta en la imagen deja la revisión en "difiere"', async () => {
    const mala = lectura()
    mala.textos = mala.textos.filter((t) => t.texto !== '$ 7.000.000')
    const m = mundo({ vision: () => visionOk(mala) })
    const r = await confirmar(m)
    const b = (await r.json()) as any
    expect(b.creativos[0].verificacion.estado).toBe('difiere')
    expect(b.creativos[0].verificacion.diferencias).toEqual([{ campo: 'precio', motivo: 'falta', esperado: '$ 7.000.000', leido: null, moto: 2 }])
  })
  it('con 2 variantes: 2 imágenes (cada una con las 4 entradas) y 2 revisiones', async () => {
    const m = mundo({ gen: gen({ cantidad: 2, costo_estimado_usd: COSTO(3, 2) }) })
    expect((await confirmar(m)).status).toBe(200)
    expect(m.imagenes).toHaveLength(2)
    expect(m.visiones).toHaveLength(2)
    for (const i of m.imagenes) expect(i.input.filter((x: { type: string }) => x.type === 'image')).toHaveLength(4)
  })
})

describe('el precio cuenta cada foto de entrada', () => {
  it('un estimado calculado con solo la moto y la referencia (2 entradas) es 409 y no pasa nada', async () => {
    const m = mundo({ gen: gen({ costo_estimado_usd: estimarCopiaFiel(PRO, 1, MODELO_V, 2).topeTotalUsd }) })
    const r = await confirmar(m)
    expect(r.status).toBe(409)
    expect(m.log).not.toContain('rpc:confirmar')
    expect(m.imagenes).toHaveLength(0)
  })
  it('el estimado correcto de 4 motos también se reconoce', async () => {
    const m = mundo({
      gen: gen({ costo_estimado_usd: COSTO(4), textos_esperados: textos([M1, M2, M3, { modelo: 'ZS 125', precio: '$ 1.900.000', condicion: null }]), parametros: { fotosExtra: [F2, F3, '55555555-5555-4555-8555-555555555555'] } }),
      foto: () => 'viva',
    })
    // la cuarta foto no existe en BYTES: alcanza con ver que el precio coincide y llega a descargar (falla recién ahí, antes de la compuerta)
    const r = await confirmar(m)
    expect(r.status).not.toBe(409)
    expect(m.log).not.toContain('imagen')
  })
})

describe('las fotos de las otras motos', () => {
  it('una foto extra borrada es 410 y no se confirma ni se llama a Gemini', async () => {
    const m = mundo({ foto: (id) => (id === F2 ? 'borrada' : 'viva') })
    const r = await confirmar(m)
    expect(r.status).toBe(410)
    expect(m.log).not.toContain('rpc:confirmar')
    expect(m.imagenes).toHaveLength(0)
  })
  it('una foto extra que no existe es 404', async () => {
    const m = mundo({ foto: (id) => (id === F3 ? 'inexistente' : 'viva') })
    const r = await confirmar(m)
    expect(r.status).toBe(404)
    expect(m.log).not.toContain('rpc:confirmar')
    expect(m.imagenes).toHaveLength(0)
  })
})

describe('coherencia de lo guardado en la generación', () => {
  it('menos fotos extra que motos en los textos => 500 sin confirmar ni llamar', async () => {
    const m = mundo({ gen: gen({ parametros: { fotosExtra: [F2] } }) })
    const r = await confirmar(m)
    expect(r.status).toBe(500)
    expect(m.log).not.toContain('rpc:confirmar')
    expect(m.imagenes).toHaveLength(0)
  })
  it.each([
    ['ids que no son UUID', ['no-soy-uuid', F3]],
    ['una foto repetida', [F2, F2]],
    ['más de tres', [F2, F3, F2, F3]],
  ])('fotosExtra inválido (%s) => 500', async (_n, ids) => {
    const m = mundo({ gen: gen({ parametros: { fotosExtra: ids } }) })
    expect((await confirmar(m)).status).toBe(500)
    expect(m.log).not.toContain('rpc:confirmar')
  })
  it('fotos extra en una generación que no es de varias motos => 500', async () => {
    const una = { modelo: 'ROUSER 200', precio: '$ 4.500.000', condicion: null, frase: null, cta: null, lugar: null, negocio: null, logo: 'ninguno', ocultos: [] }
    const m = mundo({ gen: gen({ textos_esperados: una, textos_hash: hashTextos(una as never), costo_estimado_usd: COSTO(3), parametros: { fotosExtra: [F2, F3] } }) })
    expect((await confirmar(m)).status).toBe(500)
    expect(m.log).not.toContain('rpc:confirmar')
  })
})

describe('la compuerta no cambia', () => {
  it('402 por el tope: cero llamadas a Gemini', async () => {
    const m = mundo({ confirmar: () => new Response('{"message":"x"}', { status: 402 }) })
    const r = await confirmar(m)
    expect(r.status).toBe(402)
    expect(m.imagenes).toHaveLength(0)
    expect(m.visiones).toHaveLength(0)
  })
  it('409 de un doble click: cero llamadas', async () => {
    const m = mundo({ confirmar: () => new Response('{"message":"x"}', { status: 409 }) })
    expect((await confirmar(m)).status).toBe(409)
    expect(m.imagenes).toHaveLength(0)
  })
  it('una promoción de una sola moto sigue sin leer motos extra', async () => {
    const una = { modelo: 'ROUSER 200', precio: '$ 4.500.000', condicion: null, frase: null, cta: null, lugar: null, negocio: null, logo: 'ninguno', ocultos: [] }
    const m = mundo({ gen: gen({ textos_esperados: una, textos_hash: hashTextos(una as never), costo_estimado_usd: COSTO(1), parametros: { aspecto: '4:5' } }) })
    expect((await confirmar(m)).status).toBe(200)
    expect(m.log).not.toContain('extras:leer')
    expect(m.imagenes[0].input.filter((x: { type: string }) => x.type === 'image')).toHaveLength(2)
  })
})
