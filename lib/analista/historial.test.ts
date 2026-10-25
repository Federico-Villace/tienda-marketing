import { describe, it, expect, vi } from 'vitest'
import { leerEdiciones, leerHistorial, vistaDeFila, type FilaAnalisis, type FilaEdicion } from './historial'

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
  filtros: { marcaId: '100206789578448', plataforma: 'todas', desde: '2026-09-21', hasta: '2026-10-20' },
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
      filtros: { marcaIds: ['100206789578448'], plataforma: 'todas', desde: '2026-09-21', hasta: '2026-10-20' },
      desdeCache: false,
      version: 1,
      original: 'Texto del análisis',
      editadoEn: null,
      editadoPor: null,
      versiones: [{ version: 1, fecha: '2026-10-20T15:00:00+00:00', autor: null }],
    })
  })
})

describe('vistaDeFila: filtros guardados', () => {
  it('una fila vieja con {marcaId} se lee como marcaIds=[marcaId]', () => {
    expect(vistaDeFila(fila()).filtros.marcaIds).toEqual(['100206789578448'])
  })
  it('una fila nueva con {marcaIds} se respeta', () => {
    const f = fila({ filtros: { marcaIds: ['100206789578448', '696225363810951'], plataforma: 'todas', desde: '2026-09-21', hasta: '2026-10-20' } })
    expect(vistaDeFila(f).filtros.marcaIds).toEqual(['696225363810951', '100206789578448'])
  })
})

const edicion = (o: Partial<FilaEdicion> = {}): FilaEdicion => ({
  id: 'e2',
  analisis_id: 'a1',
  version: 2,
  contenido: 'Texto corregido',
  editado_por: 'u-1',
  editado_en: '2026-10-21T10:00:00+00:00',
  ...o,
})

describe('vistaDeFila con ediciones', () => {
  it('la versión vigente es la última edición; el original queda preservado', () => {
    const v = vistaDeFila(fila(), false, [edicion(), edicion({ id: 'e3', version: 3, contenido: 'Otra vez', editado_en: '2026-10-22T10:00:00+00:00' })])
    expect(v.contenido).toBe('Otra vez')
    expect(v.original).toBe('Texto del análisis')
    expect(v.version).toBe(3)
    expect(v.editadoEn).toBe('2026-10-22T10:00:00+00:00')
    expect(v.editadoPor).toBe('u-1')
    expect(v.versiones.map((x) => x.version)).toEqual([3, 2, 1])
  })

  it('una sola edición pasa a ser la vigente (v2)', () => {
    const v = vistaDeFila(fila(), true, [edicion()])
    expect(v.contenido).toBe('Texto corregido')
    expect(v.version).toBe(2)
    expect(v.desdeCache).toBe(true)
  })
})

describe('leerEdiciones', () => {
  it('sin ids no consulta', async () => {
    const f = vi.fn<typeof fetch>()
    expect(await leerEdiciones(s, [], f)).toEqual([])
    expect(f).not.toHaveBeenCalled()
  })

  it('pide las ediciones de esos análisis, de la versión más vieja a la más nueva', async () => {
    const f = vi.fn<typeof fetch>(async () => json([edicion()]))
    expect(await leerEdiciones(s, ['a1', 'a2'], f)).toHaveLength(1)
    const url = new URL(String(f.mock.calls[0]![0]))
    expect(url.pathname).toBe('/rest/v1/ediciones_analisis')
    expect(url.searchParams.get('analisis_id')).toBe('in.(a1,a2)')
    expect(url.searchParams.get('order')).toBe('version.asc')
  })
})

describe('leerHistorial', () => {
  it('pide los últimos N de la organización, del más nuevo al más viejo', async () => {
    const f = vi.fn<typeof fetch>(async (u) =>
      json(new URL(String(u)).pathname.endsWith('ediciones_analisis') ? [] : [fila(), fila({ id: 'a2' })]),
    )
    const r = await leerHistorial(s, 'org-1', 5, f)
    expect(r.map((x) => x.id)).toEqual(['a1', 'a2'])

    const url = new URL(String(f.mock.calls[0]![0]))
    expect(url.pathname).toBe('/rest/v1/analisis')
    expect(url.searchParams.get('organizacion_id')).toBe('eq.org-1')
    expect(url.searchParams.get('order')).toBe('creado_en.desc')
    expect(url.searchParams.get('limit')).toBe('5')
  })

  it('solo los de rendimiento: los de una promoción no aparecen en el tablero', async () => {
    const f = vi.fn<typeof fetch>(async () => json([]))
    await leerHistorial(s, 'org-1', 5, f)
    expect(new URL(String(f.mock.calls[0]![0])).searchParams.get('tipo')).toBe('eq.rendimiento')
  })

  it('no pide columnas internas (hash, creado_por)', async () => {
    const f = vi.fn<typeof fetch>(async () => json([]))
    await leerHistorial(s, 'org-1', 5, f)
    const select = new URL(String(f.mock.calls[0]![0])).searchParams.get('select')!
    expect(select).not.toMatch(/hash_entrada|creado_por/)
  })

  it('aplica la edición vigente a cada análisis', async () => {
    const f = vi.fn<typeof fetch>(async (u) =>
      json(new URL(String(u)).pathname.endsWith('ediciones_analisis') ? [edicion()] : [fila(), fila({ id: 'a2' })]),
    )
    const [a1, a2] = await leerHistorial(s, 'org-1', 5, f)
    expect(a1!.contenido).toBe('Texto corregido')
    expect(a2!.contenido).toBe('Texto del análisis')
  })

  it('sin análisis devuelve [] sin consultar ediciones', async () => {
    expect(await leerHistorial(s, 'org-1', 5, async () => json([]))).toEqual([])
  })
})
