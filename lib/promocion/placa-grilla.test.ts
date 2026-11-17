import { describe, it, expect, vi, afterEach } from 'vitest'
import { faltantes, hashPlacaGrilla, manejarPlaca } from './placa'
import { manejarFormatos } from './formatos'
import { manejarCambio } from './cambios'
import { HEADER_USUARIO } from '../auth/acceso'
import { MARCAS } from '../datos/marcas'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { copyDePrueba, filaPromocion, ID_FOTO, ID_PROMO } from './fixture'
import type { MotoExtra } from './varias/tipos'

const entorno = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_xyz' }
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 9, 9, 9])
const F2 = '22222222-2222-4222-8222-222222222222'
const F3 = '33333333-3333-4333-8333-333333333333'
const SUZUKI = MARCAS[2]!.id
const BYTES: Record<string, Uint8Array<ArrayBuffer>> = {
  [ID_FOTO]: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1]),
  [F2]: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 2]),
  [F3]: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 3]),
}
const ruta = (id: string) => `${ORGANIZACION_PILOTO_ID}/${id}.jpg`
const extra = (fotoId: string, n: number, o: Partial<MotoExtra> = {}): MotoExtra => ({ fotoId, modelo: `MOTO ${n}`, precio: { moneda: 'ARS', monto: n * 1_000_000 }, promo: { tipo: 'ninguna', detalle: '' }, ...o })

const grilla = (o: Record<string, unknown> = {}) =>
  filaPromocion({
    id: ID_PROMO, marca_id: SUZUKI, foto_id: ID_FOTO, revision: 4, plantilla: 'varias_motos', fondo: null, aspecto: '4:5', modelo: 'ROUSER 200',
    copy: copyDePrueba(), titular: 'Elegí la tuya', escena_creativo_id: null, motos_extra: [extra(F2, 2), extra(F3, 3)], ...o,
  } as never)

type Mundo = { promo?: Record<string, unknown>; foto?: (id: string) => 'viva' | 'borrada' | 'inexistente' | 'webp'; rol?: string; rpc?: (nombre: string, args: any) => Response }
function mundo(o: Mundo = {}) {
  const subidas: string[] = []
  const descargas: string[] = []
  const rpcs: { nombre: string; args: any }[] = []
  const consultasFotos: URL[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    const p = url.pathname
    if (p === '/rest/v1/miembros') return json([{ rol: o.rol ?? 'director' }])
    if (p === '/rest/v1/promociones') return json([grilla(o.promo ?? {})])
    if (p === '/rest/v1/fotos') {
      consultasFotos.push(url)
      const ids = (url.searchParams.get('id') ?? '').slice(4, -1).split(',')
      return json(
        ids
          .filter((id) => (o.foto?.(id) ?? 'viva') !== 'inexistente')
          .map((id) => ({ id, ruta: (o.foto?.(id) ?? 'viva') === 'borrada' ? null : ruta(id), borrada_en: (o.foto?.(id) ?? 'viva') === 'borrada' ? '2026-11-10T00:00:00Z' : null })),
      )
    }
    if (p.startsWith('/storage/v1/object/authenticated/fotos/')) {
      const id = Object.keys(BYTES).find((k) => p.endsWith(ruta(k)))!
      descargas.push(id)
      return new Response((o.foto?.(id) ?? 'viva') === 'webp' ? Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20, 1, 2]) : BYTES[id]!)
    }
    if (p === '/storage/v1/object/sign/creativos') return json(JSON.parse(String(init?.body)).paths.map((x: string) => ({ path: x, signedURL: `/object/sign/creativos/${x}?token=T`, error: null })))
    if (p.startsWith('/storage/v1/object/creativos/')) {
      subidas.push(p)
      return json({ Key: 'x' })
    }
    if (p.startsWith('/rest/v1/rpc/')) {
      const nombre = p.split('/').pop()!
      const args = JSON.parse(String(init?.body))
      rpcs.push({ nombre, args })
      if (o.rpc) return o.rpc(nombre, args)
      if (nombre === 'editar_promocion') return json(grilla({ revision: args.p_revision + 1, placa_ruta: args.p_campos.placa_ruta, placa_hash: args.p_campos.placa_hash }))
      if (nombre === 'aprobar_promocion') return json({ id: 'ap-1', version: 1, aprobado_en: '2026-11-20T10:00:00Z', aprobado_por: 'u-1' })
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, subidas, descargas, rpcs, consultasFotos }
}
const componer = () => vi.fn(async (_p: unknown) => PNG)
const llamar = (m: ReturnType<typeof mundo>, c = componer(), revision = 4) =>
  manejarPlaca(new Request(`https://app.ejemplo.com/api/promociones/${ID_PROMO}/placa`, { method: 'POST', headers: { 'content-type': 'application/json', [HEADER_USUARIO]: 'u-1' }, body: JSON.stringify({ revision }) }), ID_PROMO, entorno, m.f, c)
const sinNada = (m: ReturnType<typeof mundo>, c: ReturnType<typeof componer>) => {
  expect(c).not.toHaveBeenCalled()
  expect(m.subidas).toHaveLength(0)
}

afterEach(() => vi.restoreAllMocks())

describe('la grilla de motos: qué le falta a la promoción', () => {
  it('no necesita una imagen de IA (escena): solo el diseño elegido y el texto', () => {
    expect(faltantes(grilla())).toEqual([])
    expect(faltantes(grilla({ copy: null }))).toEqual(['elegir el texto'])
    expect(faltantes(grilla({ plantilla: null }))).toEqual(['generar la imagen', 'elegir el diseño'])
  })
  it('las demás plantillas siguen pidiendo su escena', () => {
    expect(faltantes(filaPromocion({ plantilla: 'oferta_abajo', copy: copyDePrueba() }))).toEqual(['generar la imagen'])
  })
})

describe('la placa de la grilla de motos', () => {
  it('compone con las fotos de las motos EN ORDEN, sus textos y el formato de la promoción; sube una vez', async () => {
    const c = componer()
    const m = mundo()
    const r = await llamar(m, c)
    expect(r.status).toBe(200)
    const p = c.mock.calls[0]![0] as any
    expect(p.plantilla).toBe('varias_motos')
    expect(p.grilla.formato).toBe('4:5')
    expect(p.grilla.fotos.map((x: any) => Array.from(x.bytes))).toEqual([Array.from(BYTES[ID_FOTO]!), Array.from(BYTES[F2]!), Array.from(BYTES[F3]!)])
    expect(p.grilla.fotos.every((x: any) => x.mime === 'image/jpeg')).toBe(true)
    expect(p.grilla.textos.motos).toEqual([
      { modelo: 'ROUSER 200', precio: '$ 4.500.000', condicion: '12 cuotas sin interés' },
      { modelo: 'MOTO 2', precio: '$ 2.000.000', condicion: '' },
      { modelo: 'MOTO 3', precio: '$ 3.000.000', condicion: '' },
    ])
    expect(p.grilla.textos).toMatchObject({ marca: MARCAS[2]!.nombre, titular: 'Elegí la tuya', lugar: 'Quilmes' })
    expect(p.grilla.recursos.logo999).toMatch(/^data:image\/png;base64,/)
    expect(m.subidas).toHaveLength(1)
    expect(m.rpcs.map((x) => x.nombre)).toEqual(['editar_promocion'])
  })
  it('las fotos se buscan juntas, de la organización y como foto de moto, y se descarga una vez cada una', async () => {
    const m = mundo()
    await llamar(m)
    expect(m.consultasFotos).toHaveLength(1)
    expect(m.consultasFotos[0]!.searchParams.get('id')).toBe(`in.(${ID_FOTO},${F2},${F3})`)
    expect(m.consultasFotos[0]!.searchParams.get('uso')).toBe('eq.moto')
    expect(m.consultasFotos[0]!.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
    expect(m.descargas.sort()).toEqual([ID_FOTO, F2, F3].sort())
  })
  it('no hace falta ninguna escena ni consulta de creativos', async () => {
    const m = mundo()
    await llamar(m)
    expect(m.f.mock.calls.some(([u]) => new URL(String(u)).pathname === '/rest/v1/creativos')).toBe(false)
  })
  it('no es gratis para cualquiera: el lector no arma la imagen (403) y nada se compone', async () => {
    const c = componer()
    const m = mundo({ rol: 'lector' })
    expect((await llamar(m, c)).status).toBe(403)
    sinNada(m, c)
  })
  it('sin el texto elegido: 422 y no se compone', async () => {
    const c = componer()
    const m = mundo({ promo: { copy: null } })
    const r = await llamar(m, c)
    expect(r.status).toBe(422)
    expect(((await r.json()) as any).error).toBe('Todavía falta elegir el texto.')
    sinNada(m, c)
  })
  it('una promoción de una sola moto con la grilla (no debería pasar): 422', async () => {
    const c = componer()
    const m = mundo({ promo: { motos_extra: null } })
    expect((await llamar(m, c)).status).toBe(422)
    sinNada(m, c)
  })
  it.each([
    ['una foto borrada', (id: string) => (id === F2 ? 'borrada' : 'viva')],
    ['una foto que ya no existe', (id: string) => (id === F3 ? 'inexistente' : 'viva')],
  ] as const)('%s: 422 con el número de la moto y no se compone ni se sube', async (_n, foto) => {
    const c = componer()
    const m = mundo({ foto })
    const r = await llamar(m, c)
    expect(r.status).toBe(422)
    expect(((await r.json()) as any).error).toMatch(/moto \d/i)
    sinNada(m, c)
  })
  it('una foto que satori no sabe dibujar (WebP): 422', async () => {
    const c = componer()
    const m = mundo({ foto: (id) => (id === F2 ? 'webp' : 'viva') })
    const r = await llamar(m, c)
    expect(r.status).toBe(422)
    sinNada(m, c)
  })
  it('un texto que no entra: 422 con el mensaje, sin subir nada', async () => {
    const { ErrorTextoLargo } = await import('./plantillas')
    const m = mundo()
    const r = await llamar(m, vi.fn(async () => { throw new ErrorTextoLargo('modelo') }))
    expect(r.status).toBe(422)
    expect(((await r.json()) as any).error).toMatch(/muy largo/)
    expect(m.subidas).toHaveLength(0)
  })
  it('lo que la persona sacó (precio y lugar) llega vacío a la placa', async () => {
    const c = componer()
    await llamar(mundo({ promo: { diseno: { ocultos: ['precio', 'lugar', 'logo999'] } } }), c)
    const p = c.mock.calls[0]![0] as any
    expect(p.grilla.textos.motos.map((x: any) => x.precio)).toEqual(['', '', ''])
    expect(p.grilla.textos.lugar).toBe('')
    expect(p.grilla.recursos.logo999).toBeNull()
  })
  it('una placa que ya está al día se reusa: sin descargar ni componer ni subir', async () => {
    const c0 = componer()
    const m0 = mundo()
    const primera = (await (await llamar(m0, c0)).json()) as any
    const c = componer()
    const m = mundo({ promo: { placa_hash: primera.hash, placa_ruta: 'org/promociones/p/vieja.png' } })
    const r = await llamar(m, c)
    expect(((await r.json()) as any).reutilizada).toBe(true)
    sinNada(m, c)
    expect(m.descargas).toHaveLength(0)
  })
})

describe('hashPlacaGrilla: cambia con todo lo que se dibuja', () => {
  const base = { formato: '4:5' as const, textos: { marca: 'S', titular: 't', extra: '', lugar: 'Q', motos: [{ modelo: 'A', precio: '$ 1', condicion: '' }, { modelo: 'B', precio: '$ 2', condicion: '' }] }, rutasFotos: ['a.jpg', 'b.jpg'], recursosSha: 'r' }
  const h = (o: Partial<typeof base> = {}) => hashPlacaGrilla({ ...base, ...o })
  it('es estable', () => expect(h()).toBe(h()))
  it.each([
    ['el formato', { formato: '1:1' as const }],
    ['el precio de una moto', { textos: { ...base.textos, motos: [base.textos.motos[0]!, { modelo: 'B', precio: '$ 3', condicion: '' }] } }],
    ['el modelo', { textos: { ...base.textos, motos: [{ modelo: 'C', precio: '$ 1', condicion: '' }, base.textos.motos[1]!] } }],
    ['el titular', { textos: { ...base.textos, titular: 'otro' } }],
    ['el orden de las fotos', { rutasFotos: ['b.jpg', 'a.jpg'] }],
    ['una foto', { rutasFotos: ['a.jpg', 'c.jpg'] }],
    ['los logos', { recursosSha: 'r2' }],
  ])('%s', (_n, cambio) => expect(h(cambio as never)).not.toBe(h()))
  it('lleva una versión: si cambia cómo se dibuja, ninguna placa vieja se reusa', () => {
    expect(h()).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('otros formatos de la grilla', () => {
  it('son gratis: la misma grilla en 1:1, sin tocar la fila ni generar nada', async () => {
    const c = componer()
    const m = mundo()
    const r = await manejarFormatos(new Request(`https://app.ejemplo.com/api/promociones/${ID_PROMO}/formatos`, { method: 'POST', headers: { 'content-type': 'application/json', [HEADER_USUARIO]: 'u-1' }, body: JSON.stringify({ formato: '1:1' }) }), ID_PROMO, entorno, m.f, c)
    expect(r.status).toBe(200)
    expect((c.mock.calls[0]![0] as any).grilla.formato).toBe('1:1')
    expect(m.rpcs).toHaveLength(0)
    expect(m.subidas).toHaveLength(1)
  })
})

describe('aprobar una grilla de motos', () => {
  it('compone la placa y la aprueba sin escena de IA', async () => {
    const c = componer()
    const m = mundo()
    const r = await manejarCambio(new Request(`https://app.ejemplo.com/api/promociones/${ID_PROMO}`, { method: 'PATCH', headers: { 'content-type': 'application/json', [HEADER_USUARIO]: 'u-1' }, body: JSON.stringify({ revision: 4, accion: 'aprobar' }) }), ID_PROMO, entorno, m.f, c)
    expect(r.status).toBe(200)
    const ap = m.rpcs.find((x) => x.nombre === 'aprobar_promocion')!
    expect(ap.args).toMatchObject({ p_id: ID_PROMO, p_revision: 4, p_usuario: 'u-1' })
    expect(ap.args.p_placa_ruta).toMatch(/\.png$/)
    expect(c).toHaveBeenCalledTimes(1)
  })
})
