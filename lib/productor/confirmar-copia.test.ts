import { describe, it, expect, vi } from 'vitest'
import { HEADER_USUARIO } from '../auth/acceso'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { manejarConfirmacion } from './confirmar'
import { estimarCopiaFiel, estimarVerificacion } from '../promocion/copia/precios'
import { hashTextos } from '../promocion/copia/textos'
import type { TextosCopia } from '../promocion/copia/tipos'
import { estimarImagenes } from './precios'

const GEN_ID = '44444444-4444-4444-8444-444444444444'
const FOTO_ID = '77777777-7777-4777-8777-777777777777'
const REF_ID = '88888888-8888-4888-8888-888888888888'
const RUTA = `${ORGANIZACION_PILOTO_ID}/${FOTO_ID}.jpg`
const RUTA_REF = `${ORGANIZACION_PILOTO_ID}/${REF_ID}.jpg`
const CLAVE = 'AIza-SECRETISIMA-1234'
const entorno = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_xyz', GEMINI_API_KEY: CLAVE, PRESUPUESTO_MENSUAL_USD: '10' }
const PRO = 'gemini-3-pro-image'
const MODELO_V = 'gemini-4-argon'

const MOTO = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0x11, 0x22, 0xff, 0xd9])
const REFERENCIA = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x99, 0x98, 0xff, 0xd9])
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x04, 0x80, 0x03, 0x80, 0x01, 0, 0, 0, 0xff, 0xd9])
const imagenOk = () =>
  Response.json({
    status: 'completed',
    steps: [{ type: 'model_output', content: [{ type: 'image', data: Buffer.from(JPEG).toString('base64'), mime_type: 'image/jpeg' }] }],
    usage: { total_input_tokens: 2400, total_output_tokens: 1120, output_tokens_by_modality: [{ modality: 'image', tokens: 1120 }] },
  })

const textos: TextosCopia = {
  modelo: 'ROUSER 200', precio: '$ 4.500.000', condicion: { texto: '12 CUOTAS', destacado: 'SIN INTERÉS' }, frase: 'Tu próxima moto', cta: 'Consultanos', lugar: 'Quilmes',
  negocio: null, logo: 'real', ocultos: [],
}
const lecturaBuena = {
  textos: [
    { texto: 'ROUSER 200', rol: 'modelo', dudoso: false }, { texto: '$ 4.500.000', rol: 'precio', dudoso: false },
    { texto: '12 CUOTAS', rol: 'condicion', dudoso: false }, { texto: 'SIN INTERÉS', rol: 'condicion', dudoso: false },
    { texto: 'Tu próxima moto', rol: 'frase', dudoso: false }, { texto: 'CONSULTANOS', rol: 'cta', dudoso: false }, { texto: 'Quilmes', rol: 'lugar', dudoso: false },
  ],
  logo: { x: 0.3, y: 0.02, w: 0.4, h: 0.08 }, fondo_logo: 'oscuro',
}
const lecturaMala = { ...lecturaBuena, textos: lecturaBuena.textos.map((t) => (t.rol === 'precio' ? { ...t, texto: '$ 4.500.00' } : t)) }
const visionOk = (l: unknown = lecturaBuena) =>
  Response.json({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(l) }] }], usage: { total_input_tokens: 2000, total_output_tokens: 300, total_thought_tokens: 100 } })

const COSTO_2 = estimarCopiaFiel(PRO, 2, MODELO_V).topeTotalUsd
const gen = (o: Record<string, unknown> = {}) => ({
  id: GEN_ID, estado: 'estimada', motor: PRO, cantidad: 2, aspecto: '4:5', prompt: 'Hacé una placa copia fiel', pieza_id: null, pieza_raiz_id: null, foto_id: FOTO_ID, referencia_foto_id: REF_ID,
  costo_estimado_usd: COSTO_2, textos_esperados: textos, textos_hash: hashTextos(textos), modelo_verificacion: MODELO_V, ...o,
})

type Mundo = {
  gen?: Record<string, unknown>
  confirmar?: () => Response
  imagen?: (n: number) => Response
  vision?: (n: number) => Response | Promise<Response>
  cierre?: () => Response
}
function mundo(o: Mundo = {}) {
  const log: string[] = []
  const imagenes: any[] = []
  const visiones: any[] = []
  const verificaciones: any[] = []
  const cierres: any[] = []
  const patches: any[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    const metodo = init?.method ?? 'GET'
    if (url.hostname === 'generativelanguage.googleapis.com') {
      const cuerpo = JSON.parse(String(init!.body))
      if (cuerpo.model === MODELO_V || cuerpo.model === 'gemini-4-carbon') {
        const n = visiones.length
        visiones.push(cuerpo)
        log.push('vision')
        return (o.vision ?? (() => visionOk()))(n)
      }
      const n = imagenes.length
      imagenes.push(cuerpo)
      log.push('imagen')
      return (o.imagen ?? (() => imagenOk()))(n)
    }
    if (url.pathname === '/rest/v1/miembros') return Response.json([{ rol: 'director' }])
    if (url.pathname === '/rest/v1/generaciones' && metodo === 'GET') return Response.json([o.gen ?? gen()])
    if (url.pathname === '/rest/v1/generaciones' && metodo === 'PATCH') {
      const c = JSON.parse(String(init!.body))
      patches.push(c)
      log.push(`estado:${c.estado}`)
      return new Response(null, { status: 204 })
    }
    if (url.pathname === '/rest/v1/fotos') {
      if (url.searchParams.get('id') === `eq.${REF_ID}`) {
        log.push('ref:leer')
        return Response.json([{ ruta: RUTA_REF, borrada_en: null }])
      }
      log.push('foto:leer')
      return Response.json([{ ruta: RUTA, borrada_en: null }])
    }
    if (url.pathname.startsWith('/storage/v1/object/authenticated/fotos/')) {
      log.push(url.pathname.endsWith(RUTA_REF) ? 'ref:descargar' : 'foto:descargar')
      return new Response(url.pathname.endsWith(RUTA_REF) ? REFERENCIA : MOTO, { status: 200 })
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
    if (url.pathname === '/rest/v1/verificaciones_texto' && metodo === 'POST') {
      const c = JSON.parse(String(init!.body))
      verificaciones.push(c)
      return Response.json([{ id: `v-${verificaciones.length}`, ...c }], { status: 201 })
    }
    if (url.pathname === '/rest/v1/rpc/cerrar_verificacion_texto') {
      cierres.push(JSON.parse(String(init!.body)))
      return (o.cierre ?? (() => Response.json({})))()
    }
    throw new Error(`URL inesperada: ${metodo} ${url}`)
  })
  return { f, log, imagenes, visiones, verificaciones, cierres, patches }
}
const pedido = () => new Request(`https://app.ejemplo.com/api/generaciones/${GEN_ID}/confirmar`, { method: 'POST', headers: { 'content-type': 'application/json', [HEADER_USUARIO]: 'u-1' }, body: '{}' })
const confirmar = (m: ReturnType<typeof mundo>, e: Record<string, string> = entorno) => manejarConfirmacion(pedido(), GEN_ID, e, m.f)
const rpcFalla = (status: number) => () => new Response('{"message":"x"}', { status })

describe('confirmar una copia fiel: la compuerta', () => {
  it('si el estimado NO incluye la verificación (solo la imagen) es 409 y no pasa nada', async () => {
    const m = mundo({ gen: gen({ costo_estimado_usd: estimarImagenes(PRO, 2, { imagenesEntrada: 2 }).topeTotalUsd }) })
    const r = await confirmar(m)
    expect(r.status).toBe(409)
    expect(m.log).not.toContain('rpc:confirmar')
    expect(m.imagenes).toHaveLength(0)
    expect(m.visiones).toHaveLength(0)
  })
  it('402 (tope), 409 (doble click) y 410 (vencida): CERO llamadas a Gemini, ni imagen ni verificación', async () => {
    for (const [st, esperado] of [[402, 402], [409, 409], [410, 410]] as const) {
      const m = mundo({ confirmar: rpcFalla(st) })
      expect((await confirmar(m)).status).toBe(esperado)
      expect(m.imagenes).toHaveLength(0)
      expect(m.visiones).toHaveLength(0)
      expect(m.verificaciones).toHaveLength(0)
    }
  })
  it('las fotos se descargan ANTES de la compuerta y la compuerta antes de Gemini', async () => {
    const m = mundo()
    await confirmar(m)
    const i = (x: string) => m.log.indexOf(x)
    expect(i('foto:descargar')).toBeGreaterThan(-1)
    expect(i('ref:descargar')).toBeGreaterThan(-1)
    expect(i('foto:descargar')).toBeLessThan(i('rpc:confirmar'))
    expect(i('ref:descargar')).toBeLessThan(i('rpc:confirmar'))
    expect(i('rpc:confirmar')).toBeLessThan(i('imagen'))
  })
  it('un modelo de verificación sin precio: 500 ANTES de la compuerta (cero llamadas)', async () => {
    const m = mundo({ gen: gen({ modelo_verificacion: 'modelo-inventado' }) })
    expect((await confirmar(m)).status).toBe(500)
    expect(m.log).not.toContain('rpc:confirmar')
    expect(m.imagenes).toHaveLength(0)
  })
})

describe('confirmar una copia fiel: imágenes + verificaciones', () => {
  it('2 variantes: 2 imágenes (moto y referencia, en ese orden) y 2 verificaciones; todo ok', async () => {
    const m = mundo()
    const r = await confirmar(m)
    expect(r.status).toBe(200)
    expect(m.imagenes).toHaveLength(2)
    expect(m.visiones).toHaveLength(2)
    // La imagen se pide con la moto como PRIMERA entrada y la referencia como SEGUNDA.
    const partes = m.imagenes[0].input.filter((p: any) => p.type === 'image').map((p: any) => p.data)
    expect(partes).toEqual([Buffer.from(MOTO).toString('base64'), Buffer.from(REFERENCIA).toString('base64')])
    const body = await r.json()
    expect(body.creativos).toHaveLength(2)
    for (const c of body.creativos) expect(c.verificacion).toMatchObject({ estado: 'ok', diferencias: [] })
    expect(body.generacion.estado).toBe('ok')
  })
  it('el verificador es CIEGO: ningún pedido de verificación lleva los textos esperados', async () => {
    const m = mundo()
    await confirmar(m)
    const todo = JSON.stringify(m.visiones)
    for (const x of ['ROUSER', '4.500.000', 'Quilmes', 'Consultanos']) expect(todo).not.toContain(x)
  })
  it('el costo real es imágenes + verificaciones; el del creativo sigue siendo solo la imagen', async () => {
    const m = mundo()
    const r = await confirmar(m)
    const body = await r.json()
    const verif = (2000 * 4 + 400 * 20) / 1e6
    const imagen = body.creativos[0].costoUsd
    expect(imagen).toBeGreaterThan(0)
    expect(body.generacion.costoRealUsd).toBeCloseTo(2 * imagen + 2 * verif, 6)
    const cierre = m.patches.find((p) => p.estado === 'ok')!
    expect(cierre.costo_real_usd).toBeCloseTo(2 * imagen + 2 * verif, 6)
  })
  it("una variante que difiere se informa con sus diferencias y NO se puede usar (estado 'difiere')", async () => {
    const m = mundo({ vision: (n) => visionOk(n === 0 ? lecturaMala : lecturaBuena) })
    const body = await (await confirmar(m)).json()
    const estados = body.creativos.map((c: any) => c.verificacion.estado).sort()
    expect(estados).toEqual(['difiere', 'ok'])
    const mala = body.creativos.find((c: any) => c.verificacion.estado === 'difiere')
    expect(mala.verificacion.diferencias[0]).toMatchObject({ campo: 'precio', motivo: 'distinto' })
    expect(body.generacion.estado).toBe('ok')
  })
  it("si la verificación falla (500) la imagen igual se guarda, la variante queda en 'error' y no se cobra la verificación", async () => {
    const m = mundo({ vision: () => Response.json({ error: { message: 'boom' } }, { status: 500 }) })
    const body = await (await confirmar(m)).json()
    expect(body.creativos.every((c: any) => c.verificacion.estado === 'error' && c.url)).toBe(true)
    const imagen = body.creativos[0].costoUsd
    expect(body.generacion.costoRealUsd).toBeCloseTo(2 * imagen, 6)
  })
  it('una imagen que falló NO se verifica', async () => {
    const m = mundo({ imagen: (n) => (n === 0 ? Response.json({ error: { message: 'x' } }, { status: 500 }) : imagenOk()) })
    const body = await (await confirmar(m)).json()
    expect(m.visiones).toHaveLength(1)
    expect(m.verificaciones).toHaveLength(1)
    const fallida = body.creativos.find((c: any) => c.error)
    expect(fallida.verificacion).toBeUndefined()
    expect(body.generacion.estado).toBe('ok')
  })
  it('la verificación se registra como cobro "generacion": ya está pagada por la compuerta', async () => {
    const m = mundo()
    await confirmar(m)
    expect(m.verificaciones.every((v) => v.cobro === 'generacion' && v.textos_hash === hashTextos(textos) && v.modelo === MODELO_V)).toBe(true)
    expect(m.verificaciones[0].costo_estimado_usd).toBe(estimarVerificacion(MODELO_V).topeUsd)
  })
  it('una generación SIN textos esperados (la de siempre) no llama al verificador', async () => {
    const m = mundo({ gen: gen({ textos_esperados: null, textos_hash: null, modelo_verificacion: null, costo_estimado_usd: estimarImagenes(PRO, 2, { imagenesEntrada: 2 }).topeTotalUsd }) })
    const body = await (await confirmar(m)).json()
    expect(m.visiones).toHaveLength(0)
    expect(m.verificaciones).toHaveLength(0)
    expect(body.creativos[0]).not.toHaveProperty('verificacion')
  })
  it('un cambio (ajuste) de copia fiel lleva la base como 1ª entrada y también se verifica', async () => {
    // base_creativo_id + foto = 2 entradas, igual que la copia fiel: el precio es el mismo y la verificación también corre.
    const m = mundo({ gen: gen({ referencia_foto_id: null, base_creativo_id: 'base-1', cantidad: 2 }) })
    const e = await manejarConfirmacionConBase(m)
    expect(e).toBeDefined()
  })
})

async function manejarConfirmacionConBase(m: ReturnType<typeof mundo>) {
  // La imagen base se lee en `creativos` y se descarga del bucket de creativos: se agrega a mano a este mundo.
  const f = m.f
  const envuelta = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    if (url.pathname === '/rest/v1/creativos' && (init?.method ?? 'GET') === 'GET') return Response.json([{ ruta: 'org/g/1.jpg', mime_type: 'image/jpeg' }])
    if (url.pathname.startsWith('/storage/v1/object/authenticated/creativos/')) return new Response(JPEG, { status: 200 })
    return f(u, init)
  })
  const r = await manejarConfirmacion(pedido(), GEN_ID, entorno, envuelta)
  expect(r.status).toBe(200)
  expect(m.visiones).toHaveLength(2)
  return r
}
