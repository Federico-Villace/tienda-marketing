import { describe, it, expect, vi } from 'vitest'
import { leerVerificaciones, verificacionVigente } from './cargar'
import { estimarVerificacion } from './precios'
import { ORGANIZACION_PILOTO_ID } from '../../organizacion'

const supabase = { url: 'https://abc.supabase.co', secretKey: 'sb_secret_xyz' }
const fila = (o: Record<string, unknown> = {}) => ({
  id: 'v1', creativo_id: 'c1', generacion_id: 'g1', modelo: 'gemini-4-argon', textos_hash: 'a'.repeat(64), estado: 'ok', cobro: 'generacion', diferencias: [], avisos: [], zona_logo: null, fondo_logo: null, creado_en: '2026-11-18T10:00:00Z', ...o,
})
const mundo = (filas: unknown[]) => {
  const consultas: URL[] = []
  const f = vi.fn<typeof fetch>(async (u) => {
    const url = new URL(String(u))
    consultas.push(url)
    return Response.json(filas)
  })
  return { f, consultas }
}

describe('leerVerificaciones', () => {
  it('trae la ÚLTIMA de cada creativo, solo de la organización', async () => {
    const m = mundo([fila({ id: 'v2', creado_en: '2026-11-18T11:00:00Z', estado: 'difiere', diferencias: [{ campo: 'precio', motivo: 'distinto', esperado: 'a', leido: 'b' }] }), fila(), fila({ id: 'v3', creativo_id: 'c2' })])
    const mapa = await leerVerificaciones(supabase, ['c1', 'c2', 'c3'], m.f)
    expect(m.consultas[0]!.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
    expect(m.consultas[0]!.searchParams.get('creativo_id')).toBe('in.(c1,c2,c3)')
    expect(m.consultas[0]!.searchParams.get('order')).toBe('creado_en.desc')
    expect(mapa.get('c1')).toMatchObject({ id: 'v2', estado: 'difiere', puedeReverificar: false, costoReverificarUsd: null })
    expect(mapa.get('c1')!.diferencias).toHaveLength(1)
    expect(mapa.get('c2')!.id).toBe('v3')
    expect(mapa.has('c3')).toBe(false)
  })
  it('sin ids no consulta nada', async () => {
    const m = mundo([])
    expect((await leerVerificaciones(supabase, [], m.f)).size).toBe(0)
    expect(m.f).not.toHaveBeenCalled()
  })
  it("un 'error' se puede volver a revisar y dice cuánto sale; un 'ok' no", async () => {
    const m = mundo([fila({ estado: 'error' })])
    const v = (await leerVerificaciones(supabase, ['c1'], m.f)).get('c1')!
    expect(v).toMatchObject({ puedeReverificar: true, costoReverificarUsd: estimarVerificacion('gemini-4-argon').topeUsd })
  })
  it("una pendiente se muestra como 'pendiente' y no se ofrece revisar", async () => {
    const v = (await leerVerificaciones(supabase, ['c1'], mundo([fila({ estado: 'pendiente' })]).f)).get('c1')!
    expect(v).toMatchObject({ estado: 'pendiente', puedeReverificar: false })
  })
  it('un modelo que ya no tiene precio no tira: simplemente no ofrece volver a revisar', async () => {
    const v = (await leerVerificaciones(supabase, ['c1'], mundo([fila({ estado: 'error', modelo: 'viejo' })]).f)).get('c1')!
    expect(v).toMatchObject({ puedeReverificar: false, costoReverificarUsd: null })
  })
})

describe('verificacionVigente', () => {
  it('la última de la imagen, con la zona del logo, el fondo y el hash contra el que se comparó', async () => {
    const m = mundo([fila({ zona_logo: { x: 0.3, y: 0.02, w: 0.4, h: 0.08, porDefecto: false }, fondo_logo: 'oscuro' })])
    const v = await verificacionVigente(supabase, 'c1', m.f)
    expect(m.consultas[0]!.searchParams.get('limit')).toBe('1')
    expect(v).toMatchObject({ estado: 'ok', textosHash: 'a'.repeat(64), fondoLogo: 'oscuro', zonaLogo: { x: 0.3, y: 0.02, w: 0.4, h: 0.08 } })
  })
  it('sin verificación: null', async () => {
    expect(await verificacionVigente(supabase, 'c1', mundo([]).f)).toBeNull()
  })
})
