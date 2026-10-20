import { describe, it, expect, vi } from 'vitest'
import { leerPublicaciones } from './publicaciones'
import { marcaDeCuenta } from './marcas'

const s = { url: 'https://abc.supabase.co', secretKey: 'sb_secret_xyz' }
const json = (c: unknown) => new Response(JSON.stringify(c), { status: 200 })

const fila = (o: Record<string, unknown> = {}) => ({
  publicacion_id: 'u1',
  cuenta_meta_id: '17841436179087906',
  plataforma: 'instagram',
  tipo: 'reel',
  texto: 'Nueva Zontes',
  permalink: 'https://instagram.com/p/x',
  publicado_en: '2026-10-01T15:00:00+00:00',
  vistas: 100,
  alcance: 80,
  me_gusta: 10,
  comentarios: 3,
  compartidos: 2,
  guardados: 5,
  fecha_metrica: '2026-10-20',
  ...o,
})

function base(filas: unknown[], sync: unknown[] = []) {
  return vi.fn<typeof fetch>(async (u) => {
    const url = new URL(String(u))
    if (url.pathname.endsWith('/rpc/resumen_publicaciones')) return json(filas)
    if (url.pathname.endsWith('/sincronizaciones')) return json(sync)
    throw new Error(`URL inesperada: ${url}`)
  })
}

describe('marcaDeCuenta', () => {
  it('resuelve por id de página y por id de Instagram', () => {
    expect(marcaDeCuenta('1327958853726987')?.nombre).toBe('Zontes Quilmes')
    expect(marcaDeCuenta('17841436179087906')?.nombre).toBe('Zontes Quilmes')
    expect(marcaDeCuenta('desconocida')).toBeUndefined()
  })
})

describe('leerPublicaciones', () => {
  it('invoca la RPC con la organización y el desde', async () => {
    const f = base([])
    await leerPublicaciones(s, 'org-1', '2026-07-23', f)
    const [u, init] = f.mock.calls.find(([x]) => String(x).includes('/rpc/'))!
    expect(String(u)).toContain('resumen_publicaciones')
    expect(JSON.parse(String(init?.body))).toEqual({ p_organizacion: 'org-1', p_desde: '2026-07-23' })
  })

  it('convierte las filas al modelo del tablero (camelCase, null -> 0, texto vacío)', async () => {
    const f = base([fila({ alcance: null, guardados: null, texto: null, vistas: null })])
    const { publicaciones } = await leerPublicaciones(s, 'org-1', '2026-07-23', f)
    expect(publicaciones[0]).toEqual({
      id: 'u1',
      marcaId: '1327958853726987',
      plataforma: 'instagram',
      tipo: 'reel',
      texto: '',
      publicadoEn: new Date('2026-10-01T15:00:00+00:00'),
      vistas: 0,
      meGusta: 10,
      comentarios: 3,
      compartidos: 2,
      guardados: 0,
    })
  })

  it('la cuenta de IG se mapea a la marca de su página; la de FB, a sí misma', async () => {
    const f = base([fila(), fila({ publicacion_id: 'u2', cuenta_meta_id: '1327958853726987', plataforma: 'facebook' })])
    const { publicaciones } = await leerPublicaciones(s, 'org-1', '2026-07-23', f)
    expect(publicaciones.map((p) => p.marcaId)).toEqual(['1327958853726987', '1327958853726987'])
  })

  it('descarta las publicaciones de cuentas que no son una marca conocida', async () => {
    const f = base([fila({ cuenta_meta_id: 'otra' })])
    expect((await leerPublicaciones(s, 'org-1', '2026-07-23', f)).publicaciones).toEqual([])
  })

  it('sin filas devuelve []', async () => {
    expect((await leerPublicaciones(s, 'org-1', '2026-07-23', base([]))).publicaciones).toEqual([])
  })

  it('trae la última corrida de tipo publicaciones', async () => {
    const f = base([], [{ estado: 'ok', terminada_en: '2026-10-20T09:16:00Z', error: null }])
    const r = await leerPublicaciones(s, 'org-1', '2026-07-23', f)
    expect(r.ultimaSync).toEqual({ estado: 'ok', terminadaEn: '2026-10-20T09:16:00Z', error: null })
    const url = new URL(String(f.mock.calls.find(([x]) => String(x).includes('sincronizaciones'))![0]))
    expect(url.searchParams.get('tipo')).toBe('eq.publicaciones')
  })
})
