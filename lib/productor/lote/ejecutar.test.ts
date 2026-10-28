import { describe, it, expect, vi, afterEach } from 'vitest'
import { manejarEjecucion } from './ejecutar'
import { entorno, foto, ID_LOTE, ID_REF, mundo, request, type Mundo } from './mundo-fixture'
import { estimarImagenes } from '../precios'

afterEach(() => vi.restoreAllMocks())

const GEN = '44444444-4444-4444-8444-444444444444'
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x04, 0x80, 0x03, 0x80, 0x01, 0, 0, 0, 0xff, 0xd9])
const imagenOk = () =>
  Response.json({
    status: 'completed',
    steps: [{ type: 'model_output', content: [{ type: 'image', data: Buffer.from(JPEG).toString('base64'), mime_type: 'image/jpeg' }] }],
    usage: { total_input_tokens: 100, total_output_tokens: 1120, output_tokens_by_modality: [{ modality: 'image', tokens: 1120 }] },
  })

const gen = (o: Record<string, unknown> = {}) => ({
  id: GEN,
  estado: 'confirmada',
  motor: 'gemini-nano-banana-2.1',
  cantidad: 2,
  aspecto: '4:5',
  prompt: 'Escena de la moto',
  pieza_id: null,
  pieza_raiz_id: null,
  foto_id: foto(1),
  referencia_foto_id: null,
  costo_estimado_usd: estimarImagenes('gemini-nano-banana-2.1', 2, { conFoto: true }).topeTotalUsd,
  lote_id: ID_LOTE,
  ...o,
})
const iniciarOk = () => Response.json(gen({ estado: 'corriendo' }))
const rpcFalla = (status: number, message = 'x') => () => new Response(JSON.stringify({ message }), { status })
const m0 = (o: Mundo = {}) => mundo({ generacion: [gen()], rpc: { iniciar_generacion_lote: iniciarOk }, gemini: imagenOk, ...o })
const llamar = (m: ReturnType<typeof mundo>, id = GEN, e: Record<string, string | undefined> = entorno, usuario: string | null = 'u-1') =>
  manejarEjecucion(request(`/api/generaciones/${id}/ejecutar`, {}, usuario), id, e, m.f)

describe('rechazos: cero llamadas a Gemini (R18)', () => {
  it('sin sesión 401, lector 403, sin clave o sin tope 503', async () => {
    const mundos = [m0(), m0({ rol: 'lector' }), m0(), m0()]
    const r = [
      await llamar(mundos[0]!, GEN, entorno, null),
      await llamar(mundos[1]!),
      await llamar(mundos[2]!, GEN, { ...entorno, GEMINI_API_KEY: '' }),
      await llamar(mundos[3]!, GEN, { ...entorno, PRESUPUESTO_MENSUAL_USD: '' }),
    ]
    expect(r.map((x) => x.status)).toEqual([401, 403, 503, 503])
    for (const m of mundos) {
      expect(m.rpcs).toHaveLength(0)
      expect(m.gemini).toHaveLength(0)
    }
  })
  it('id inválido o generación inexistente: 404', async () => {
    const a = m0()
    expect((await llamar(a, 'abc')).status).toBe(404)
    const b = m0({ generacion: [] })
    expect((await llamar(b)).status).toBe(404)
    for (const m of [a, b]) {
      expect(m.rpcs).toHaveLength(0)
      expect(m.gemini).toHaveLength(0)
    }
  })
  it('una generación que NO es de un lote: 409 sin RPC (solo se ejecutan ítems de lote)', async () => {
    const m = m0({ generacion: [gen({ lote_id: null })] })
    expect((await llamar(m)).status).toBe(409)
    expect(m.rpcs).toHaveLength(0)
    expect(m.gemini).toHaveLength(0)
  })
  it('la RPC dice PT409 (ya corre, ya terminó o no está confirmada): 409 y Gemini en cero', async () => {
    const m = m0({ rpc: { iniciar_generacion_lote: rpcFalla(409) } })
    const r = await llamar(m)
    expect(r.status).toBe(409)
    expect(((await r.json()) as any).error).toBe('Ya se está generando o ya terminó.')
    expect(m.gemini).toHaveLength(0)
  })
  it('PT404 de la RPC: 404', async () => {
    const m = m0({ rpc: { iniciar_generacion_lote: rpcFalla(404) } })
    expect((await llamar(m)).status).toBe(404)
    expect(m.gemini).toHaveLength(0)
  })
  it('un motor sin precio o una cantidad inválida: 500 sin RPC', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const o of [{ motor: 'inventado' }, { cantidad: 0 }, { cantidad: 9 }]) {
      const m = m0({ generacion: [gen(o)] })
      expect((await llamar(m)).status).toBe(500)
      expect(m.rpcs).toHaveLength(0)
      expect(m.gemini).toHaveLength(0)
    }
  })
  it('lee la generación SOLO de la organización', async () => {
    const m = m0()
    await llamar(m)
    const u = new URL(String(m.f.mock.calls.find(([x]) => new URL(String(x)).pathname === '/rest/v1/generaciones')![0]))
    expect(u.searchParams.get('id')).toBe(`eq.${GEN}`)
  })
})

describe('la foto se borró entre confirmar y ejecutar: error con costo 0, sin Gemini', () => {
  it('foto de la moto borrada → 410, la generación queda en error con costo real 0', async () => {
    const m = m0({ fotos: { borradas: [foto(1)] } })
    const r = await llamar(m)
    expect(r.status).toBe(410)
    expect(m.gemini).toHaveLength(0)
    expect(m.patches).toHaveLength(1)
    expect(m.patches[0]!.body).toMatchObject({ estado: 'error', costo_real_usd: 0 })
    expect(m.patches[0]!.body.error).toMatch(/foto/)
    expect(m.patches[0]!.query).toContain(`id=eq.${GEN}`)
  })
  it('inexistente → 404 y también se cierra en error costo 0', async () => {
    const m = m0({ fotos: { faltan: [foto(1)] } })
    expect((await llamar(m)).status).toBe(404)
    expect(m.gemini).toHaveLength(0)
    expect(m.patches[0]!.body).toMatchObject({ estado: 'error', costo_real_usd: 0 })
  })
  it('la inspiración borrada → 410, mismo cierre', async () => {
    const m = m0({ generacion: [gen({ referencia_foto_id: ID_REF })], ref: 'borrada' })
    expect((await llamar(m)).status).toBe(410)
    expect(m.gemini).toHaveLength(0)
    expect(m.patches[0]!.body).toMatchObject({ estado: 'error', costo_real_usd: 0 })
  })
  it('si Storage falla al bajar la foto: 500, error costo 0 y sin Gemini (se puede volver a pedir)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = m0({ descarga: 'falla' })
    const r = await llamar(m)
    expect(r.status).toBe(500)
    expect(m.gemini).toHaveLength(0)
    expect(m.patches[0]!.body).toMatchObject({ estado: 'error', costo_real_usd: 0 })
  })
})

describe('ejecución', () => {
  it('inicia (confirmada → corriendo) con el usuario ANTES de llamar a Gemini', async () => {
    const m = m0()
    await llamar(m)
    expect(m.rpcs).toEqual([{ nombre: 'iniciar_generacion_lote', args: { p_id: GEN, p_usuario: 'u-1' } }])
  })

  it('pide `cantidad` imágenes con la foto de la moto, guarda cada creativo y cierra ok con el costo real', async () => {
    const m = m0()
    const r = await llamar(m)
    expect(r.status).toBe(200)
    expect(m.gemini).toHaveLength(2)
    expect(m.inserts.map((i) => i.body.orden).sort()).toEqual([1, 2])
    expect(m.inserts[0]!.body).toMatchObject({ generacion_id: GEN, foto_id: foto(1), aspecto: '4:5', costo_fuente: 'usage' })
    expect(m.patches).toHaveLength(1)
    expect(m.patches[0]!.body).toMatchObject({ estado: 'ok' })
    expect(typeof m.patches[0]!.body.costo_real_usd).toBe('number')
    const b = (await r.json()) as any
    expect(b.generacion).toMatchObject({ id: GEN, estado: 'ok' })
    expect(b.generacion.costoRealUsd).toBeGreaterThan(0)
    expect(b.creativos).toHaveLength(2)
    expect(b.creativos[0].url).toContain('token=T')
    expect(JSON.stringify(b)).not.toContain('"ruta"')
  })

  it('no manda la clave en la URL ni la devuelve', async () => {
    const m = m0()
    const r = await llamar(m)
    expect(m.gemini.join(' ')).not.toContain('AIza')
    expect(await r.text()).not.toContain('AIza')
  })

  it('si Gemini falla en todas, cierra en error con costo real 0 y responde 200 con el estado', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = m0({ gemini: () => new Response('{"error":{"message":"cuota"}}', { status: 429 }) })
    const r = await llamar(m)
    expect(r.status).toBe(200)
    expect(m.patches[0]!.body).toMatchObject({ estado: 'error', costo_real_usd: 0 })
    expect(((await r.json()) as any).generacion.estado).toBe('error')
  })
})
