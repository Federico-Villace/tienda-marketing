import { describe, it, expect, vi } from 'vitest'
import { HEADER_USUARIO } from '../auth/acceso'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { manejarConfirmacion } from './confirmar'

const GEN_ID = '44444444-4444-4444-8444-444444444444'
const PIEZA_ID = '22222222-2222-4222-8222-222222222222'
const RAIZ_ID = '33333333-3333-4333-8333-333333333333'
const CLAVE = 'AIza-SECRETISIMA-1234'
const SECRETA = 'sb_secret_xyz'
const entorno = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SECRET_KEY: SECRETA,
  GEMINI_API_KEY: CLAVE,
  PRESUPUESTO_MENSUAL_USD: '10',
}

// JPEG mínimo con un SOF0 de 896x1152.
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x04, 0x80, 0x03, 0x80, 0x01, 0, 0, 0, 0xff, 0xd9])
const imagenOk = (usage: object | null = { total_input_tokens: 100, total_output_tokens: 1120, output_tokens_by_modality: [{ modality: 'image', tokens: 1120 }] }) =>
  Response.json({
    status: 'completed',
    steps: [{ type: 'model_output', content: [{ type: 'image', data: Buffer.from(JPEG).toString('base64'), mime_type: 'image/jpeg' }] }],
    ...(usage ? { usage } : {}),
  })

const generacion = (o: Record<string, unknown> = {}) => ({
  id: GEN_ID,
  organizacion_id: ORGANIZACION_PILOTO_ID,
  estado: 'estimada',
  motor: 'gemini-nano-banana-2.1',
  cantidad: 3,
  aspecto: '4:5',
  prompt: 'Fotografía publicitaria de una moto',
  pieza_id: PIEZA_ID,
  pieza_raiz_id: RAIZ_ID,
  costo_estimado_usd: 0.13005,
  ...o,
})

type Gemini = (n: number) => Response | Promise<Response>
type Mundo = {
  rol?: string | null
  gen?: Record<string, unknown> | null
  confirmar?: () => Response
  gastado?: number
  gemini?: Gemini
  subida?: (n: number) => Response
  firma?: 'ok' | 'falla'
}

function mundo(o: Mundo = {}) {
  const log: string[] = []
  const gemini: { url: string; headers: Record<string, string>; body: any }[] = []
  const subidas: { ruta: string; mime: string }[] = []
  const creativos: any[] = []
  const actualizaciones: { tabla: string; donde: string; cambios: any }[] = []
  let enVuelo = 0
  let maxEnVuelo = 0
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    const metodo = init?.method ?? 'GET'
    if (url.hostname === 'generativelanguage.googleapis.com') {
      const n = gemini.length
      gemini.push({ url: String(u), headers: init!.headers as Record<string, string>, body: JSON.parse(String(init!.body)) })
      log.push('gemini')
      enVuelo++
      maxEnVuelo = Math.max(maxEnVuelo, enVuelo)
      await new Promise((r) => setTimeout(r, 5))
      try {
        return await (o.gemini ?? (() => imagenOk()))(n)
      } finally {
        enVuelo--
      }
    }
    if (url.pathname === '/rest/v1/miembros') return Response.json(o.rol === null ? [] : [{ rol: o.rol ?? 'director' }])
    if (url.pathname === '/rest/v1/generaciones' && metodo === 'GET') {
      expect(url.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
      return Response.json(o.gen === null ? [] : [o.gen ?? generacion()])
    }
    if (url.pathname === '/rest/v1/generaciones' && metodo === 'PATCH') {
      const cambios = JSON.parse(String(init!.body))
      actualizaciones.push({ tabla: 'generaciones', donde: url.searchParams.get('id') ?? '', cambios })
      log.push(`estado:${cambios.estado}`)
      return new Response(null, { status: 204 })
    }
    if (url.pathname === '/rest/v1/rpc/confirmar_generacion') {
      log.push('rpc:confirmar')
      return (o.confirmar ?? (() => Response.json(generacion({ estado: 'confirmada' }))))()
    }
    if (url.pathname === '/rest/v1/rpc/gasto_generaciones_mes') return Response.json(o.gastado ?? 0)
    if (url.pathname.startsWith('/storage/v1/object/sign/creativos')) {
      if (o.firma === 'falla') return new Response('{"message":"x"}', { status: 500 })
      const { paths } = JSON.parse(String(init!.body))
      return Response.json(paths.map((p: string) => ({ path: p, signedURL: `/object/sign/creativos/${p}?token=TOK`, error: null })))
    }
    if (url.pathname.startsWith('/storage/v1/object/creativos/')) {
      subidas.push({ ruta: url.pathname.replace('/storage/v1/object/creativos/', ''), mime: (init!.headers as Record<string, string>)['content-type']! })
      return (o.subida ?? (() => new Response('{}', { status: 200 })))(subidas.length - 1)
    }
    if (url.pathname === '/rest/v1/creativos' && metodo === 'POST') {
      const cuerpo = JSON.parse(String(init!.body))
      creativos.push(cuerpo)
      return Response.json([{ id: `c-${cuerpo.orden}`, elegida: false, ...cuerpo }])
    }
    throw new Error(`URL inesperada: ${metodo} ${url}`)
  })
  return { f, log, gemini, subidas, creativos, actualizaciones, maxEnVuelo: () => maxEnVuelo }
}

const pedido = (cuerpo: unknown = {}, usuario: string | null = 'u-1') =>
  new Request(`https://app.ejemplo.com/api/generaciones/${GEN_ID}/confirmar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(usuario ? { [HEADER_USUARIO]: usuario } : {}) },
    body: JSON.stringify(cuerpo),
  })
const confirmar = (m: ReturnType<typeof mundo>, cuerpo: unknown = {}, id = GEN_ID, e: Record<string, string | undefined> = entorno) =>
  manejarConfirmacion(pedido(cuerpo), id, e, m.f)
const rpcFalla = (status: number, message = 'x') => () => new Response(JSON.stringify({ message }), { status })

describe('REGLA #3: sin confirmar no hay gasto', () => {
  it.each([
    ['402 tope excedido', rpcFalla(402, 'Supera el tope mensual'), 402],
    ['409 segundo click', rpcFalla(409, 'Ya se confirmó'), 409],
    ['410 vencida', rpcFalla(410, 'La estimación venció'), 410],
    ['404 inexistente', rpcFalla(404), 404],
  ])('S5.2/S5.3/S6.1 %s: cero llamadas a Gemini y a Storage', async (_n, confirmarRpc, status) => {
    const m = mundo({ confirmar: confirmarRpc, gastado: 0.95 })
    const r = await confirmar(m)
    expect(r.status).toBe(status)
    expect(m.gemini).toHaveLength(0)
    expect(m.subidas).toHaveLength(0)
    expect(m.creativos).toHaveLength(0)
    expect(m.actualizaciones).toHaveLength(0)
  })

  it('un error inesperado de la RPC es 500 y tampoco llama a Gemini', async () => {
    const m = mundo({ confirmar: rpcFalla(500, 'boom') })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await confirmar(m)
    expect(r.status).toBe(500)
    expect(m.gemini).toHaveLength(0)
    expect(JSON.stringify(await r.json())).not.toContain('boom')
    spy.mockRestore()
  })

  it('Gemini se llama recién DESPUÉS de que la RPC confirmó', async () => {
    const m = mundo()
    await confirmar(m)
    expect(m.log.indexOf('rpc:confirmar')).toBeGreaterThan(-1)
    expect(m.log.indexOf('rpc:confirmar')).toBeLessThan(m.log.indexOf('gemini'))
    expect(m.log.indexOf('estado:corriendo')).toBeLessThan(m.log.indexOf('gemini'))
  })

  it('S5.4 dos confirmaciones concurrentes: una sola tanda de requests', async () => {
    let tomada = false
    const m = mundo({
      confirmar: () => {
        if (tomada) return new Response('{"message":"Ya se confirmó"}', { status: 409 })
        tomada = true
        return Response.json(generacion({ estado: 'confirmada' }))
      },
    })
    const [a, b] = await Promise.all([confirmar(m), confirmar(m)])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    expect(m.gemini).toHaveLength(3)
  })

  it('S6.1 el 402 trae tope, gastado y restante', async () => {
    const m = mundo({ confirmar: rpcFalla(402), gastado: 9.95 })
    const r = await confirmar(m, {}, GEN_ID, { ...entorno, PRESUPUESTO_MENSUAL_USD: '10' })
    expect(await r.json()).toMatchObject({ topeUsd: 10, gastadoUsd: 9.95, restanteUsd: 0.05 })
  })

  it('la RPC recibe el tope del ENTORNO y el usuario de la sesión, nunca del cliente', async () => {
    const m = mundo()
    await manejarConfirmacion(pedido({ tope: 9999, p_tope: 9999, costo: 0, usuario: 'otro' }, 'u-7'), GEN_ID, entorno, m.f)
    const llamada = m.f.mock.calls.find(([u]) => String(u).includes('rpc/confirmar_generacion'))!
    expect(JSON.parse(String(llamada[1]!.body))).toEqual({ p_id: GEN_ID, p_tope: 10, p_usuario: 'u-7' })
  })

  it('S5.6 un precio en el body se ignora', async () => {
    const m = mundo()
    const r = await confirmar(m, { costo_estimado_usd: 0.0001, precio: 0, costoEstimadoUsd: 0 })
    expect(r.status).toBe(200)
    expect(m.gemini).toHaveLength(3)
  })

  it('un motor sin precio es 500 ANTES de la RPC y de Gemini', async () => {
    const m = mundo({ gen: generacion({ motor: 'imagen-4.0-generate' }) })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await confirmar(m)
    expect(r.status).toBe(500)
    expect(m.log).toEqual([])
    spy.mockRestore()
  })

  it('si el precio cambió desde la estimación es 409 "estimá de nuevo" sin RPC ni Gemini', async () => {
    const m = mundo({ gen: generacion({ costo_estimado_usd: 0.0001 }) })
    const r = await confirmar(m)
    expect(r.status).toBe(409)
    expect((await r.json()).error).toMatch(/estim/i)
    expect(m.log).toEqual([])
  })

  it('una cantidad corrupta en la fila es 500 sin llamadas', async () => {
    const m = mundo({ gen: generacion({ cantidad: 40 }) })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await confirmar(m)).status).toBe(500)
    expect(m.log).toEqual([])
    spy.mockRestore()
  })
})

describe('acceso (S5.5)', () => {
  it('sin sesión 401, lector 403, sin llamadas', async () => {
    const m = mundo()
    expect((await manejarConfirmacion(pedido({}, null), GEN_ID, entorno, m.f)).status).toBe(401)
    const l = mundo({ rol: 'lector' })
    expect((await confirmar(l)).status).toBe(403)
    expect(l.gemini).toHaveLength(0)
    expect(l.log).toEqual([])
  })

  it('un id que no es UUID, o de otra organización, es 404 sin llamadas', async () => {
    const m = mundo()
    expect((await confirmar(m, {}, 'abc')).status).toBe(404)
    const o = mundo({ gen: null })
    expect((await confirmar(o)).status).toBe(404)
    expect(o.log).toEqual([])
  })

  it('sin GEMINI_API_KEY o sin tope es 503 sin llamadas', async () => {
    for (const e of [{ ...entorno, GEMINI_API_KEY: undefined }, { ...entorno, PRESUPUESTO_MENSUAL_USD: 'abc' }]) {
      const m = mundo()
      expect((await confirmar(m, {}, GEN_ID, e)).status).toBe(503)
      expect(m.f).not.toHaveBeenCalled()
    }
  })
})

describe('generación (R7)', () => {
  it('S7.1 cantidad 3: exactamente 3 requests simultáneas, todas store:false', async () => {
    const m = mundo()
    await confirmar(m)
    expect(m.gemini).toHaveLength(3)
    expect(m.maxEnVuelo()).toBe(3)
    for (const g of m.gemini) {
      expect(g.body.store).toBe(false)
      expect(g.body.response_format).toMatchObject({ image_size: '1K', aspect_ratio: '4:5' })
    }
  })

  it('S7.2 usa el prompt guardado y la clave solo va en el header', async () => {
    const m = mundo()
    await confirmar(m)
    for (const g of m.gemini) {
      expect(g.body.input).toBe('Fotografía publicitaria de una moto')
      expect(g.headers['x-goog-api-key']).toBe(CLAVE)
      expect(g.url).not.toContain(CLAVE)
      expect(JSON.stringify(g.body)).not.toContain(CLAVE)
    }
  })

  it('S7.3 pasa por corriendo y termina ok, con costo real y terminada_en', async () => {
    const m = mundo()
    const r = await confirmar(m)
    expect(r.status).toBe(200)
    expect(m.log.filter((x) => x.startsWith('estado:'))).toEqual(['estado:corriendo', 'estado:ok'])
    const cierre = m.actualizaciones.at(-1)!.cambios
    expect(cierre.estado).toBe('ok')
    expect(typeof cierre.costo_real_usd).toBe('number')
    expect(cierre.terminada_en).toBeTruthy()
    expect(cierre.error).toBeNull()
    expect(m.actualizaciones.every((a) => a.donde === `eq.${GEN_ID}`)).toBe(true)
  })

  it('S7.3 si todas fallan termina en error', async () => {
    const m = mundo({ gemini: () => new Response('{"error":{"message":"caído"}}', { status: 500 }) })
    const r = await confirmar(m)
    expect(r.status).toBe(200)
    expect(m.actualizaciones.at(-1)!.cambios.estado).toBe('error')
    expect((await r.json()).creativos.every((c: any) => c.url === null && c.error)).toBe(true)
  })

  it('S7.4/S7.5 resultado parcial: 2 ok y 1 fallida; la generación queda ok con el error anotado', async () => {
    const m = mundo({ gemini: (n) => (n === 1 ? new Response('{"error":{"message":"sobrecarga"}}', { status: 503 }) : imagenOk()) })
    const r = await confirmar(m)
    const cuerpo = await r.json()
    expect(cuerpo.creativos.filter((c: any) => c.url)).toHaveLength(2)
    expect(cuerpo.creativos.filter((c: any) => c.error)).toHaveLength(1)
    const cierre = m.actualizaciones.at(-1)!.cambios
    expect(cierre.estado).toBe('ok')
    expect(cierre.error).toMatch(/1 de 3/)
    expect(m.creativos.filter((c) => c.ruta === null && c.error)).toHaveLength(1)
  })
})

describe('costo real siempre registrado (R8)', () => {
  const cierre = (m: ReturnType<typeof mundo>) => m.actualizaciones.at(-1)!.cambios

  it('S8.1 con usage: suma el costo de cada imagen y lo guarda por generación', async () => {
    const m = mundo()
    await confirmar(m)
    // cada una: (100*1,5 + 1120*30)/1e6 = 0,03375
    expect(cierre(m).costo_real_usd).toBe(0.10125)
    expect(m.creativos.every((c) => c.costo_usd === 0.03375 && c.costo_fuente === 'usage')).toBe(true)
    expect(m.creativos[0]).toMatchObject({ tokens_entrada: 100, tokens_imagen: 1120 })
  })

  it('S8.2 sin bloque de imagen pero con usage: imagen en error y su costo SUMADO', async () => {
    const m = mundo({
      gemini: (n) =>
        n === 0
          ? Response.json({ status: 'failed', steps: [], errors: [{ message: 'bloqueada por seguridad' }], usage: { total_input_tokens: 100, total_output_tokens: 0 } })
          : imagenOk(),
    })
    await confirmar(m)
    // 100*1,5/1e6 = 0,00015 + 2 * 0,03375
    expect(cierre(m).costo_real_usd).toBe(0.06765)
    const fallida = m.creativos.find((c) => c.error)!
    expect(fallida.costo_usd).toBe(0.00015)
    expect(fallida.ruta).toBeNull()
  })

  it('S8.3 sin usage: igual queda un número (tarifa por imagen exitosa)', async () => {
    const m = mundo({ gemini: () => imagenOk(null) })
    await confirmar(m)
    expect(cierre(m).costo_real_usd).toBe(0.1008)
    expect(m.creativos.every((c) => c.costo_fuente === 'tarifa')).toBe(true)
  })

  it('S8.4 todas fallan por red: costo_real_usd = 0, nunca null', async () => {
    const m = mundo({ gemini: () => Promise.reject(new TypeError('fetch failed')) })
    await confirmar(m)
    expect(cierre(m).costo_real_usd).toBe(0)
    expect(cierre(m).estado).toBe('error')
    expect(m.creativos.every((c) => c.costo_fuente === 'sin_cargo')).toBe(true)
  })

  it('un timeout (puede haberse cobrado) se registra al tope por imagen', async () => {
    const m = mundo({ gemini: () => Promise.reject(Object.assign(new Error('t'), { name: 'TimeoutError' })) })
    await confirmar(m)
    expect(m.creativos.every((c) => c.costo_fuente === 'tope' && c.costo_usd === 0.04335)).toBe(true)
    expect(cierre(m).costo_real_usd).toBe(0.13005)
  })

  it('S8.5 el estimado se conserva: el cierre no lo pisa', async () => {
    const m = mundo()
    await confirmar(m)
    expect('costo_estimado_usd' in cierre(m)).toBe(false)
  })
})

describe('almacenamiento y respuesta (R9)', () => {
  it('S9.1 sube cada imagen con la clave secreta a organizacion/generacion/orden.jpg y guarda la fila', async () => {
    const m = mundo()
    await confirmar(m)
    expect(m.subidas.map((s) => s.ruta).sort()).toEqual([1, 2, 3].map((i) => `${ORGANIZACION_PILOTO_ID}/${GEN_ID}/${i}.jpg`))
    expect(m.subidas.every((s) => s.mime === 'image/jpeg')).toBe(true)
    expect(m.creativos).toHaveLength(3)
    expect(m.creativos[0]).toMatchObject({
      organizacion_id: ORGANIZACION_PILOTO_ID, generacion_id: GEN_ID, pieza_id: PIEZA_ID, pieza_raiz_id: RAIZ_ID,
      aspecto: '4:5', mime_type: 'image/jpeg', ancho: 896, alto: 1152, error: null,
    })
    expect(m.creativos.map((c) => c.orden).sort()).toEqual([1, 2, 3])
    expect(m.creativos.every((c) => c.ruta?.startsWith(`${ORGANIZACION_PILOTO_ID}/${GEN_ID}/`))).toBe(true)
  })

  it('S9.2 devuelve URLs firmadas y NINGÚN base64', async () => {
    const m = mundo()
    const r = await confirmar(m)
    const texto = JSON.stringify(await r.json())
    expect(texto).toContain('token=TOK')
    expect(texto).not.toContain(Buffer.from(JPEG).toString('base64'))
    expect(texto).not.toMatch(/"data"|base64/)
  })

  it('S9.3 si falla la subida de una imagen ya pagada: esa va en error pero su costo igual se registra', async () => {
    const m = mundo({ subida: (n) => (n === 0 ? new Response('{"message":"disco lleno"}', { status: 500 }) : new Response('{}', { status: 200 })) })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await confirmar(m)
    const cuerpo = await r.json()
    expect(cuerpo.creativos.filter((c: any) => c.error)).toHaveLength(1)
    expect(cuerpo.creativos.find((c: any) => c.error).error).toMatch(/guardar/i)
    expect(JSON.stringify(cuerpo)).not.toContain('disco lleno')
    expect(m.actualizaciones.at(-1)!.cambios.costo_real_usd).toBe(0.10125)
    expect(m.creativos.find((c) => c.error).costo_usd).toBe(0.03375)
    spy.mockRestore()
  })

  it('si falla el firmado, las imágenes quedan guardadas con url null (no se rompe)', async () => {
    const m = mundo({ firma: 'falla' })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await confirmar(m)
    expect(r.status).toBe(200)
    expect((await r.json()).creativos.every((c: any) => c.url === null)).toBe(true)
    spy.mockRestore()
  })

  it('S9.4 ni las tablas, ni los logs, ni la respuesta, ni los errores llevan las claves', async () => {
    const logs = vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = mundo({
      gemini: (n) => (n === 0 ? new Response(`{"error":{"message":"key ${CLAVE} inválida"}}`, { status: 400 }) : imagenOk()),
      subida: (n) => (n === 1 ? new Response(`{"message":"${SECRETA}"}`, { status: 500 }) : new Response('{}', { status: 200 })),
    })
    const r = await confirmar(m)
    const todo = JSON.stringify([await r.json(), m.creativos, m.actualizaciones, logs.mock.calls])
    expect(todo).not.toContain(CLAVE)
    expect(todo).not.toContain(SECRETA)
    expect(todo).not.toContain('TOK&')
    logs.mockRestore()
  })

  it('las filas de creativos nunca llevan URLs firmadas', async () => {
    const m = mundo()
    await confirmar(m)
    expect(JSON.stringify(m.creativos)).not.toMatch(/token=|https?:/)
  })

  it('responde con la generación cerrada y los creativos en orden', async () => {
    const m = mundo()
    const cuerpo = await (await confirmar(m)).json()
    expect(cuerpo.generacion).toMatchObject({ id: GEN_ID, estado: 'ok', costoRealUsd: 0.10125, costoEstimadoUsd: 0.13005, error: null })
    expect(cuerpo.creativos.map((c: any) => c.orden)).toEqual([1, 2, 3])
    expect(cuerpo.creativos[0]).toMatchObject({ elegida: false, ancho: 896, alto: 1152, costoUsd: 0.03375, error: null })
    expect(cuerpo.creativos[0].url).toBe(`https://abc.supabase.co/storage/v1/object/sign/creativos/${ORGANIZACION_PILOTO_ID}/${GEN_ID}/1.jpg?token=TOK`)
  })
})
