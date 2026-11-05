import { describe, it, expect, vi } from 'vitest'
import { modeloPorFoto, primerModeloPorFoto } from './modelo-de-foto'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'

const s = { url: 'https://abc.supabase.co', secretKey: 'sb_secret_xyz' }
const json = (c: unknown) => new Response(JSON.stringify(c), { status: 200 })

describe('primerModeloPorFoto', () => {
  it('se queda con el modelo de la promoción más nueva de cada foto', () => {
    const m = primerModeloPorFoto([
      { foto_id: 'a', modelo: 'TRK 502', creado_en: '2026-10-01T00:00:00Z' },
      { foto_id: 'a', modelo: 'Leoncino', creado_en: '2026-10-20T00:00:00Z' },
      { foto_id: 'b', modelo: 'Imperiale', creado_en: '2026-10-05T00:00:00Z' },
    ])
    expect(m.get('a')).toBe('Leoncino')
    expect(m.get('b')).toBe('Imperiale')
    expect(m.get('c')).toBeUndefined()
  })
})

describe('modeloPorFoto', () => {
  it('sin fotos no consulta nada', async () => {
    const f = vi.fn<typeof fetch>()
    expect((await modeloPorFoto(s, [], f)).size).toBe(0)
    expect(f).not.toHaveBeenCalled()
  })
  it('consulta solo las promociones de esas fotos y de la organización, las más nuevas primero', async () => {
    const f = vi.fn<typeof fetch>(async () => json([{ foto_id: 'a', modelo: 'TRK 502', creado_en: '2026-10-01T00:00:00Z' }]))
    const r = await modeloPorFoto(s, ['a', 'b'], f)
    const url = new URL(String(f.mock.calls[0]![0]))
    expect(url.pathname).toBe('/rest/v1/promociones')
    expect(url.searchParams.get('foto_id')).toBe('in.(a,b)')
    expect(url.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
    expect(url.searchParams.get('order')).toBe('creado_en.desc')
    expect(r.get('a')).toBe('TRK 502')
    expect(r.get('b')).toBeUndefined()
  })
})
