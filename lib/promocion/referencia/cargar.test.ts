import { describe, it, expect, vi } from 'vitest'
import { leerPlantillaLista, leerVistaDeLectura, leerVistasDeLecturas } from './cargar'
import { plantillaDePrueba } from './fixture'

const s = { url: 'https://abc.supabase.co', secretKey: 'sb_secret_xyz' }
const ID = '88888888-8888-4888-8888-888888888888'
const con = (filas: unknown[]) => vi.fn<typeof fetch>(async () => Response.json(filas))

describe('leerVistaDeLectura', () => {
  it('trae la lectura usable de la organización, sin pendientes ni errores', async () => {
    const f = con([{ id: ID, estado: 'lista', plantilla: plantillaDePrueba(), fallback: null, avisos: ['frase:descartada_sin_espacio'], crudo: { motivo: 'ok' } }])
    const v = await leerVistaDeLectura(s, ID, f)
    expect(v).toMatchObject({ id: ID, estado: 'lista', avisos: [{ zona: 'frase', codigo: 'descartada_sin_espacio' }] })
    const url = new URL(String(f.mock.calls[0]![0]))
    expect(url.pathname).toBe('/rest/v1/referencias_diseno')
    expect(url.searchParams.get('organizacion_id')).toMatch(/^eq\./)
    expect(url.searchParams.get('id')).toBe(`eq.${ID}`)
  })
  it('sin id o sin fila: null (y sin pedir nada si no hay id)', async () => {
    const f = con([])
    expect(await leerVistaDeLectura(s, null, f)).toBeNull()
    expect(f).not.toHaveBeenCalled()
    expect(await leerVistaDeLectura(s, ID, f)).toBeNull()
  })
  it('una lectura pendiente o con error no es usable: null', async () => {
    expect(await leerVistaDeLectura(s, ID, con([{ id: ID, estado: 'pendiente', plantilla: null, fallback: null, avisos: [], crudo: null }]))).toBeNull()
  })
})

describe('leerPlantillaLista', () => {
  it('devuelve la plantilla solo si la lectura está LISTA', async () => {
    const f = con([{ id: ID, estado: 'lista', plantilla: plantillaDePrueba(), fallback: null, avisos: [], crudo: null }])
    expect(await leerPlantillaLista(s, ID, f)).toMatchObject({ ancho: 1080 })
    const inutil = con([{ id: ID, estado: 'inutilizable', plantilla: null, fallback: 'deportiva', avisos: [], crudo: null }])
    expect(await leerPlantillaLista(s, ID, inutil)).toBeNull()
  })
})

describe('leerVistasDeLecturas (varias a la vez, para una tanda)', () => {
  const ID2 = '88888888-8888-4888-8888-888888888889'
  it('una sola consulta con todos los ids, y un mapa id → lectura; lo que no sirve no figura', async () => {
    const f = con([
      { id: ID, estado: 'lista', plantilla: plantillaDePrueba(), fallback: null, avisos: [], crudo: null },
      { id: ID2, estado: 'error', plantilla: null, fallback: null, avisos: [], crudo: null },
    ])
    const m = await leerVistasDeLecturas(s, [ID, ID2, ID], f)
    expect([...m.keys()]).toEqual([ID])
    expect(f).toHaveBeenCalledTimes(1)
    const url = new URL(String(f.mock.calls[0]![0]))
    expect(url.searchParams.get('id')).toBe(`in.(${ID},${ID2})`)
    expect(url.searchParams.get('organizacion_id')).toMatch(/^eq\./)
  })
  it('sin ids no consulta nada', async () => {
    const f = con([])
    expect((await leerVistasDeLecturas(s, [], f)).size).toBe(0)
    expect(f).not.toHaveBeenCalled()
  })
})
