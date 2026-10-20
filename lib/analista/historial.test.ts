import { describe, it, expect, vi } from 'vitest'
import { leerHistorial, vistaDeFila, type FilaAnalisis } from './historial'

const s = { url: 'https://abc.supabase.co', secretKey: 'sb_secret_xyz' }
const json = (c: unknown) => new Response(JSON.stringify(c), { status: 200 })

const fila = (o: Partial<FilaAnalisis> = {}): FilaAnalisis => ({
  id: 'a1',
  contenido: 'Texto del análisis',
  modelo: 'gpt-6-luna',
  costo_usd: '0.001300',
  tokens_entrada: 3000,
  tokens_salida: 2000,
  creado_en: '2026-10-20T15:00:00+00:00',
  filtros: { marcaId: 'm1', plataforma: 'todas', desde: '2026-09-21', hasta: '2026-10-20' },
  ...o,
})

describe('vistaDeFila', () => {
  it('convierte la fila a la vista (camelCase, costo numérico, desdeCache false)', () => {
    expect(vistaDeFila(fila())).toEqual({
      id: 'a1',
      contenido: 'Texto del análisis',
      modelo: 'gpt-6-luna',
      costoUsd: 0.0013,
      tokensEntrada: 3000,
      tokensSalida: 2000,
      creadoEn: '2026-10-20T15:00:00+00:00',
      filtros: { marcaId: 'm1', plataforma: 'todas', desde: '2026-09-21', hasta: '2026-10-20' },
      desdeCache: false,
    })
  })
})

describe('leerHistorial', () => {
  it('pide los últimos N de la organización, del más nuevo al más viejo', async () => {
    const f = vi.fn<typeof fetch>(async () => json([fila(), fila({ id: 'a2' })]))
    const r = await leerHistorial(s, 'org-1', 5, f)
    expect(r.map((x) => x.id)).toEqual(['a1', 'a2'])

    const url = new URL(String(f.mock.calls[0]![0]))
    expect(url.pathname).toBe('/rest/v1/analisis')
    expect(url.searchParams.get('organizacion_id')).toBe('eq.org-1')
    expect(url.searchParams.get('order')).toBe('creado_en.desc')
    expect(url.searchParams.get('limit')).toBe('5')
  })

  it('no pide columnas internas (hash, creado_por)', async () => {
    const f = vi.fn<typeof fetch>(async () => json([]))
    await leerHistorial(s, 'org-1', 5, f)
    const select = new URL(String(f.mock.calls[0]![0])).searchParams.get('select')!
    expect(select).not.toMatch(/hash_entrada|creado_por/)
  })

  it('sin análisis devuelve []', async () => {
    expect(await leerHistorial(s, 'org-1', 5, async () => json([]))).toEqual([])
  })
})
