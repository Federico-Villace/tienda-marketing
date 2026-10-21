import { describe, it, expect, vi } from 'vitest'
import { piezasDePrueba } from '../contenidista/fixture'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { leerPantallaProductor } from './pantalla'

const s = { url: 'https://abc.supabase.co', secretKey: 'sb_secret_xyz' }
const AHORA = Date.parse('2026-10-26T15:00:00Z')
const imagen = piezasDePrueba()[1]!

const piezaFila = (id: string, raiz: string, o: Record<string, unknown> = {}) => ({
  id, raiz_id: raiz, version: 2, estado: 'aprobada', aprobado_en: '2026-10-26T10:00:00Z', pieza: imagen, ...o,
})
const creativoFila = (id: string, o: Record<string, unknown> = {}) => ({
  id, generacion_id: 'g1', pieza_raiz_id: 'r1', orden: 1, ruta: `o/g1/${id}.jpg`, ancho: 896, alto: 1152, aspecto: '4:5',
  costo_usd: 0.03375, error: null, elegida: false, creado_en: '2026-10-26T12:00:00Z', ...o,
})
const genFila = (id: string, o: Record<string, unknown> = {}) => ({
  id, pieza_raiz_id: 'r1', estado: 'ok', motor: 'gemini-nano-banana-2.1', cantidad: 2, costo_estimado_usd: 0.0867,
  costo_real_usd: 0.0675, error: null, creado_en: '2026-10-26T11:59:00Z', confirmada_en: '2026-10-26T12:00:00Z', ...o,
})

function mundo(o: { piezas?: unknown[]; gens?: unknown[]; creativos?: unknown[]; gasto?: unknown } = {}) {
  const consultas: URL[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    consultas.push(url)
    if (url.pathname === '/rest/v1/piezas') return Response.json(o.piezas ?? [piezaFila('p1', 'r1')])
    if (url.pathname === '/rest/v1/generaciones') return Response.json(o.gens ?? [genFila('g1')])
    if (url.pathname === '/rest/v1/creativos') return Response.json(o.creativos ?? [creativoFila('c1'), creativoFila('c2', { orden: 2, elegida: true })])
    if (url.pathname === '/rest/v1/rpc/gasto_generaciones_mes') return Response.json(o.gasto ?? 1.25)
    if (url.pathname.startsWith('/storage/v1/object/sign/creativos')) {
      const { paths } = JSON.parse(String(init!.body))
      return Response.json(paths.map((p: string) => ({ path: p, signedURL: `/object/sign/creativos/${p}?token=T`, error: null })))
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, consultas }
}

describe('leerPantallaProductor', () => {
  it('lee solo las piezas aprobadas imagen|carrusel|historia de la organización', async () => {
    const m = mundo()
    await leerPantallaProductor(s, m.f, () => AHORA)
    const q = m.consultas.find((u) => u.pathname === '/rest/v1/piezas')!
    expect(q.searchParams.get('estado')).toBe('eq.aprobada')
    expect(q.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
    expect(q.searchParams.get('pieza->>formato')).toBe('in.(imagen,carrusel,historia)')
    expect(q.searchParams.get('limit')).toBe('50')
  })

  it('arma la vista: pieza, aspecto, creativos con URL firmada y gasto del mes', async () => {
    const m = mundo()
    const p = await leerPantallaProductor(s, m.f, () => AHORA)
    expect(p.gastadoUsd).toBe(1.25)
    expect(p.piezas).toHaveLength(1)
    const v = p.piezas[0]!
    expect(v).toMatchObject({ id: 'p1', raizId: 'r1', version: 2, aspecto: '4:5' })
    expect(v.pieza.briefVisual).toBe(imagen.briefVisual)
    expect(v.creativos.map((c) => c.url)).toEqual([
      'https://abc.supabase.co/storage/v1/object/sign/creativos/o/g1/c1.jpg?token=T',
      'https://abc.supabase.co/storage/v1/object/sign/creativos/o/g1/c2.jpg?token=T',
    ])
    expect(v.creativos[1]!.elegida).toBe(true)
    expect(v.generaciones[0]).toMatchObject({ id: 'g1', estado: 'ok', costoRealUsd: 0.0675, interrumpida: false })
  })

  it('no trae las estimaciones sin confirmar ni expone rutas ni claves', async () => {
    const m = mundo()
    const p = await leerPantallaProductor(s, m.f, () => AHORA)
    expect(m.consultas.find((u) => u.pathname === '/rest/v1/generaciones')!.searchParams.get('estado')).toBe('neq.estimada')
    const texto = JSON.stringify(p)
    expect(texto).not.toContain('sb_secret_xyz')
    expect(texto).not.toMatch(/"ruta"|base64/)
  })

  it('un creativo con error no tiene URL y no se firma', async () => {
    const m = mundo({ creativos: [creativoFila('c1', { ruta: null, error: 'Falló' })] })
    const p = await leerPantallaProductor(s, m.f, () => AHORA)
    expect(p.piezas[0]!.creativos[0]).toMatchObject({ url: null, error: 'Falló' })
    expect(m.consultas.some((u) => u.pathname.includes('/object/sign/'))).toBe(false)
  })

  it('una generación corriendo hace más de 10 minutos figura como interrumpida', async () => {
    const m = mundo({ gens: [genFila('g1', { estado: 'corriendo', costo_real_usd: null, confirmada_en: '2026-10-26T14:40:00Z' }), genFila('g2', { estado: 'corriendo', costo_real_usd: null, confirmada_en: '2026-10-26T14:58:00Z' })] })
    const p = await leerPantallaProductor(s, m.f, () => AHORA)
    expect(p.piezas[0]!.generaciones.map((g) => [g.id, g.interrumpida, g.costoRealUsd])).toEqual([['g1', true, null], ['g2', false, null]])
  })

  it('sin piezas elegibles no consulta generaciones ni creativos', async () => {
    const m = mundo({ piezas: [] })
    const p = await leerPantallaProductor(s, m.f, () => AHORA)
    expect(p.piezas).toEqual([])
    expect(m.consultas.map((u) => u.pathname)).toEqual(['/rest/v1/piezas', '/rest/v1/rpc/gasto_generaciones_mes'])
  })

  it('si falla el firmado las imágenes siguen listadas con url null', async () => {
    const base = mundo()
    const f = vi.fn<typeof fetch>(async (u, init) =>
      String(u).includes('/object/sign/') ? new Response('{}', { status: 500 }) : base.f(u, init),
    )
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const p = await leerPantallaProductor(s, f, () => AHORA)
    expect(p.piezas[0]!.creativos.every((c) => c.url === null)).toBe(true)
    spy.mockRestore()
  })
})
