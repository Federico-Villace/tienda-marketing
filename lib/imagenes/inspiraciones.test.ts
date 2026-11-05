import { describe, it, expect, vi } from 'vitest'
import { leerInspiraciones } from './inspiraciones'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'

const s = { url: 'https://abc.supabase.co', secretKey: 'sb_secret_xyz' }
const RUTA = `${ORGANIZACION_PILOTO_ID}/i1.jpg`

function mundo(filas: unknown[]) {
  const f = vi.fn<typeof fetch>(async (u) => {
    const url = new URL(String(u))
    if (url.pathname === '/rest/v1/fotos') return Response.json(filas)
    if (url.pathname.startsWith('/storage/v1/object/sign/fotos')) {
      return Response.json([{ path: RUTA, signedURL: `/object/sign/fotos/${RUTA}?token=T` }])
    }
    throw new Error(`URL inesperada ${url}`)
  })
  return f
}

describe('leerInspiraciones', () => {
  it('pide solo las de inspiración, vivas, de la organización, las más nuevas primero y 12 como máximo', async () => {
    const f = mundo([])
    await leerInspiraciones(s, f)
    const url = new URL(String(f.mock.calls[0]![0]))
    expect(url.searchParams.get('uso')).toBe('eq.inspiracion')
    expect(url.searchParams.get('borrada_en')).toBe('is.null')
    expect(url.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
    expect(url.searchParams.get('order')).toBe('creado_en.desc')
    expect(url.searchParams.get('limit')).toBe('12')
  })

  it('devuelve id, fecha y URL firmada; nunca la ruta', async () => {
    const r = await leerInspiraciones(s, mundo([{ id: 'i1', ruta: RUTA, creado_en: '2026-10-25T10:00:00+00:00' }, { id: 'i2', ruta: null, creado_en: '2026-10-24T10:00:00+00:00' }]))
    expect(r).toEqual([
      { id: 'i1', creadoEn: '2026-10-25T10:00:00+00:00', url: expect.stringContaining('token=T') },
      { id: 'i2', creadoEn: '2026-10-24T10:00:00+00:00', url: null },
    ])
    expect(JSON.stringify(r)).not.toContain('"ruta"')
  })
})
