import { describe, it, expect, vi, afterEach } from 'vitest'
import { manejarEjecucion } from './ejecutar'
import { entorno, foto, ID_LOTE, ID_REF, mundo, request, type Mundo } from './mundo-fixture'
import { estimarCopiaFiel } from '../../promocion/copia/precios'

afterEach(() => vi.restoreAllMocks())

const GEN = '44444444-4444-4444-8444-444444444444'
const PRO = 'gemini-3-pro-image'
const VERIF = 'gemini-4-argon'
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x04, 0x80, 0x03, 0x80, 0x01, 0, 0, 0, 0xff, 0xd9])
const textos = { modelo: 'ROUSER 200', precio: '$ 4.500.000', condicion: null, frase: null, cta: null, lugar: null, negocio: null, logo: 'real', ocultos: [] }
const lectura = { textos: [{ texto: 'ROUSER 200', rol: 'modelo', dudoso: false }, { texto: '$ 4.500.000', rol: 'precio', dudoso: false }], logo: null, fondo_logo: 'oscuro' }
const lecturaMala = { ...lectura, textos: [{ texto: 'ROUSER 200', rol: 'modelo', dudoso: false }, { texto: '$ 450.000', rol: 'precio', dudoso: false }] }

/** Gemini simulado: pedidos de imagen y pedidos de visión (el revisor de textos) se distinguen por el modelo. */
const gemini = (l: unknown = lectura) => (url: string, init?: RequestInit) => {
  const cuerpo = JSON.parse(String(init?.body ?? '{}'))
  if (cuerpo.model === VERIF) {
    return Response.json({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(l) }] }], usage: { total_input_tokens: 2000, total_output_tokens: 300, total_thought_tokens: 100 } })
  }
  return Response.json({
    status: 'completed',
    steps: [{ type: 'model_output', content: [{ type: 'image', data: Buffer.from(JPEG).toString('base64'), mime_type: 'image/jpeg' }] }],
    usage: { total_input_tokens: 2400, total_output_tokens: 1120, output_tokens_by_modality: [{ modality: 'image', tokens: 1120 }] },
  })
}
const gen = (o: Record<string, unknown> = {}) => ({
  id: GEN, estado: 'confirmada', motor: PRO, cantidad: 2, aspecto: '4:5', prompt: 'copia fiel', pieza_id: null, pieza_raiz_id: null, foto_id: foto(1), referencia_foto_id: ID_REF,
  costo_estimado_usd: estimarCopiaFiel(PRO, 2, VERIF, 2).topeTotalUsd, lote_id: ID_LOTE, textos_esperados: textos, textos_hash: 'a'.repeat(64), modelo_verificacion: VERIF, ...o,
})
const m0 = (o: Mundo = {}) =>
  mundo({ generacion: [gen()], rpc: { iniciar_generacion_lote: () => Response.json(gen({ estado: 'corriendo' })), cerrar_verificacion_texto: () => Response.json({}) }, gemini: gemini(), ...o })
const llamar = (m: ReturnType<typeof mundo>, usuario: string | null = 'u-1') => manejarEjecucion(request(`/api/generaciones/${GEN}/ejecutar`, {}, usuario), GEN, entorno, m.f)
const cierres = (m: ReturnType<typeof mundo>) => m.rpcs.filter((r) => r.nombre === 'cerrar_verificacion_texto').map((r) => r.args)

describe('ejecutar un ítem de copia fiel de un lote ya confirmado', () => {
  it('genera cada variante, descarga la moto y la referencia, y REVISA los textos de cada una (una revisión por imagen)', async () => {
    const m = m0()
    const r = await llamar(m)
    expect(r.status).toBe(200)
    const pedidos = m.gemini.length
    // 2 imágenes + 2 revisiones.
    expect(pedidos).toBe(4)
    expect(m.inserts.filter((i) => i.tabla === 'verificaciones_texto')).toHaveLength(2)
    expect(cierres(m).map((c) => c.p_estado)).toEqual(['ok', 'ok'])
    const b = (await r.json()) as any
    expect(b.creativos.map((c: any) => c.verificacion.estado)).toEqual(['ok', 'ok'])
  })

  it('la revisión ya está pagada por el lote (cobro "generacion"): el costo real suma imágenes + revisiones', async () => {
    const m = m0()
    const b = (await (await llamar(m)).json()) as any
    expect(m.inserts.filter((i) => i.tabla === 'verificaciones_texto').every((i) => i.body.cobro === 'generacion')).toBe(true)
    expect(b.generacion.costoRealUsd).toBeGreaterThan(0)
    expect(b.generacion.costoRealUsd).toBeLessThan(b.generacion.costoEstimadoUsd)
  })

  it('una imagen con textos que no coinciden queda "difiere" con sus diferencias: la pantalla no la deja usar ni aprobar', async () => {
    const m = m0({ gemini: gemini(lecturaMala) })
    const b = (await (await llamar(m)).json()) as any
    expect(b.creativos[0].verificacion.estado).toBe('difiere')
    expect(b.creativos[0].verificacion.diferencias.length).toBeGreaterThan(0)
    expect(b.creativos[0].verificacion.puedeReverificar).toBe(false)
  })

  it('un lector no ejecuta: 403 y cero llamadas a Gemini', async () => {
    const m = m0({ rol: 'lector' })
    expect((await llamar(m)).status).toBe(403)
    expect(m.gemini).toHaveLength(0)
    expect(m.rpcs).toHaveLength(0)
  })

  it('un doble click (la base ya la tiene corriendo) es 409 y NO llama a Gemini', async () => {
    const m = m0({ rpc: { iniciar_generacion_lote: () => new Response(JSON.stringify({ message: 'x' }), { status: 409 }) } })
    expect((await llamar(m)).status).toBe(409)
    expect(m.gemini).toHaveLength(0)
  })
})
