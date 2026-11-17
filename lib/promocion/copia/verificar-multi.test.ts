import { describe, it, expect, vi } from 'vitest'
import { verificarCreativo } from './verificar'
import { leerVerificacion } from './esquema'
import type { MotoTexto, TextosCopia } from './tipos'

const MODELO = 'gemini-4-argon'
const ctx = { supabase: { url: 'https://abc.supabase.co', secretKey: 'sb_secret_xyz' }, apiKey: 'AIza-SECRETISIMA-1234' }
const BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })

const moto = (n: number): MotoTexto => ({ modelo: `MOTO ${n} PRO`, precio: `$ ${n}.000.000`, condicion: { texto: '12 CUOTAS', destacado: 'SIN INTERÉS' } })
const motos = [moto(1), moto(2), moto(3), moto(4)]
const esperado: TextosCopia = { motos, modelo: null, precio: null, condicion: null, frase: 'Elegí la tuya', cta: 'Consultanos', lugar: 'Quilmes', negocio: null, logo: 'real', ocultos: [] }
// 4 motos con el modelo en dos renglones y la condición en dos estilos: 4 × 5 + 3 = 23 textos (más de los 20 de una moto sola).
const textosLeidos = [
  ...motos.flatMap((m) => [
    { texto: m.modelo!.split(' ').slice(0, 2).join(' '), rol: 'modelo', dudoso: false },
    { texto: 'PRO', rol: 'modelo', dudoso: false },
    { texto: m.precio!, rol: 'precio', dudoso: false },
    { texto: '12 CUOTAS', rol: 'condicion', dudoso: false },
    { texto: 'SIN INTERÉS', rol: 'condicion', dudoso: false },
  ]),
  { texto: 'Elegí la tuya', rol: 'frase', dudoso: false },
  { texto: 'CONSULTANOS', rol: 'cta', dudoso: false },
  { texto: 'Quilmes', rol: 'lugar', dudoso: false },
]
const lectura = { textos: textosLeidos, logo: { x: 0.3, y: 0.02, w: 0.4, h: 0.08 }, fondo_logo: 'oscuro' }
const gemini = (l: unknown) => json({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(l) }] }], usage: { total_input_tokens: 2000, total_output_tokens: 600, total_thought_tokens: 100 } })

function mundo(l: unknown = lectura) {
  const cierres: any[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    if (url.hostname === 'generativelanguage.googleapis.com') return gemini(l)
    if (url.pathname === '/rest/v1/verificaciones_texto') return json([{ id: 'ver-1' }], 201)
    if (url.pathname === '/rest/v1/rpc/cerrar_verificacion_texto') {
      cierres.push(JSON.parse(String(init?.body)))
      return json({})
    }
    throw new Error(`ruta inesperada ${url.pathname}`)
  })
  return { f, cierres }
}
const ejecutar = (m: ReturnType<typeof mundo>) => verificarCreativo(ctx, { creativoId: 'cr-1', generacionId: 'g-1', modelo: MODELO, bytes: BYTES, mime: 'image/jpeg', esperado, textosHash: 'a'.repeat(64), cobro: 'generacion' }, m.f)

describe('leerVerificacion: el tope de textos', () => {
  const muchos = (n: number) => ({ textos: Array.from({ length: n }, (_, i) => ({ texto: `t${i}`, rol: 'otro', dudoso: false })), logo: null, fondo_logo: 'oscuro' })
  it('por defecto 20 (una moto sola)', () => expect(leerVerificacion(muchos(25))!.textos).toHaveLength(20))
  it('con varias motos admite hasta 32', () => {
    expect(leerVerificacion(muchos(25), 32)!.textos).toHaveLength(25)
    expect(leerVerificacion(muchos(40), 32)!.textos).toHaveLength(32)
  })
})

describe('verificarCreativo con varias motos', () => {
  it('lee los 23 textos de 4 motos sin cortarlos y todo igual da ok', async () => {
    const m = mundo()
    const r = await ejecutar(m)
    expect(r).toMatchObject({ estado: 'ok', diferencias: [] })
    expect(m.cierres[0]).toMatchObject({ p_estado: 'ok' })
    expect(m.cierres[0].p_leido.textos).toHaveLength(23)
  })
  it('un precio mal de la moto 3 da difiere y guarda de qué moto habla', async () => {
    const mala = { ...lectura, textos: textosLeidos.map((t) => (t.texto === '$ 3.000.000' ? { ...t, texto: '$ 3.000.00' } : t)) }
    const m = mundo(mala)
    const r = await ejecutar(m)
    expect(r.estado).toBe('difiere')
    expect(r.diferencias).toEqual([{ campo: 'precio', motivo: 'distinto', esperado: '$ 3.000.000', leido: '$ 3.000.00', moto: 3 }])
    expect(m.cierres[0].p_diferencias[0]).toMatchObject({ moto: 3 })
  })
})
