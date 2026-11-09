import { describe, it, expect, vi, afterEach } from 'vitest'
import { manejarFormatos } from './formatos'
import { HEADER_USUARIO } from '../auth/acceso'
import { MARCAS } from '../datos/marcas'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { copyDePrueba, filaPromocion, ID_ESCENA, ID_FOTO, ID_PROMO } from './fixture'

const entorno = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_xyz' }
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 9, 9, 9])
const ESCENA = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])

const completa = (o: Record<string, unknown> = {}) =>
  filaPromocion({ id: ID_PROMO, marca_id: MARCAS[2]!.id, foto_id: ID_FOTO, revision: 4, plantilla: 'impactante_textura', posicion_moto: 'centro', fondo: 'estudio_oscuro', copy: copyDePrueba(), titular: 'Tu próxima aventura', escena_creativo_id: ID_ESCENA, aspecto: '4:5', ...o } as never)

const pedido = (cuerpo: unknown, usuario: string | null = 'u-1') =>
  new Request(`https://app.ejemplo.com/api/promociones/${ID_PROMO}/formatos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(usuario ? { [HEADER_USUARIO]: usuario } : {}) },
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  })

function mundo(o: { rol?: string | null; promo?: Record<string, unknown> | null; subida?: 'ok' | 'ya_existe' } = {}) {
  const subidas: string[] = []
  const escrituras: string[] = []
  const firmas: any[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    const p = url.pathname
    if (p === '/rest/v1/miembros') return json(o.rol === null ? [] : [{ rol: o.rol ?? 'director' }])
    if (p === '/rest/v1/promociones') {
      if (init?.method && init.method !== 'GET') escrituras.push(p)
      return json(o.promo === null ? [] : [completa(o.promo ?? {})])
    }
    if (p === '/rest/v1/creativos') return json([{ id: ID_ESCENA, ruta: `${ORGANIZACION_PILOTO_ID}/gen-1/1.jpg`, mime_type: 'image/jpeg', generaciones: { promocion_id: ID_PROMO, tanda_id: null } }])
    if (p.startsWith('/rest/v1/rpc/')) {
      escrituras.push(p)
      return json({})
    }
    if (p.startsWith('/storage/v1/object/authenticated/creativos/')) return new Response(ESCENA)
    if (p === '/storage/v1/object/sign/creativos') {
      const body = JSON.parse(String(init?.body))
      firmas.push({ body, url: String(u) })
      return json(body.paths.map((x: string) => ({ path: x, signedURL: `/object/sign/creativos/${x}?token=T`, error: null })))
    }
    if (p.startsWith('/storage/v1/object/creativos/')) {
      subidas.push(p.replace('/storage/v1/object/creativos/', ''))
      return o.subida === 'ya_existe' ? json({ message: 'already exists' }, 409) : json({ Key: 'x' })
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, subidas, escrituras, firmas }
}
const componer = () => vi.fn(async (_p: any) => PNG)
const llamar = (m: ReturnType<typeof mundo>, cuerpo: unknown = { formato: '1:1' }, c = componer(), usuario: string | null = 'u-1') => manejarFormatos(pedido(cuerpo, usuario), ID_PROMO, entorno, m.f, c)

afterEach(() => vi.restoreAllMocks())

describe('POST /api/promociones/[id]/formatos', () => {
  it('sin sesión 401, lector 403, y no compone', async () => {
    const c = componer()
    expect((await llamar(mundo(), { formato: '1:1' }, c, null)).status).toBe(401)
    expect((await llamar(mundo({ rol: 'lector' }), { formato: '1:1' }, c)).status).toBe(403)
    expect(c).not.toHaveBeenCalled()
  })

  it('un formato que no es 1:1, 4:5 o 9:16 es 400; un id que no existe, 404', async () => {
    for (const cuerpo of [{}, { formato: '16:9' }, { formato: 5 }, 'no json']) expect((await llamar(mundo(), cuerpo)).status).toBe(400)
    expect((await llamar(mundo({ promo: null }))).status).toBe(404)
    expect((await manejarFormatos(pedido({ formato: '1:1' }), 'abc', entorno, mundo().f, componer())).status).toBe(404)
  })

  it('una plantilla clásica es 422: se descarga solo en su formato', async () => {
    const c = componer()
    const r = await llamar(mundo({ promo: { plantilla: 'oferta_abajo' } }), { formato: '1:1' }, c)
    expect(r.status).toBe(422)
    expect(((await r.json()) as any).error).toBe('Este diseño se descarga solo en su formato.')
    expect(c).not.toHaveBeenCalled()
  })

  it('sin diseño elegido o sin imagen es 422 con lo que falta', async () => {
    expect((await llamar(mundo({ promo: { plantilla: null } }))).status).toBe(422)
    const r = await llamar(mundo({ promo: { escena_creativo_id: null } }))
    expect(r.status).toBe(422)
    expect(((await r.json()) as any).error).toMatch(/imagen/)
  })

  it('compone en el formato pedido, lo sube con otro nombre que la placa principal y devuelve la URL de descarga con nombre', async () => {
    const m = mundo()
    const c = componer()
    const r = await llamar(m, { formato: '9:16' }, c)
    expect(r.status).toBe(200)
    expect(c.mock.calls[0]![0]).toMatchObject({ plantilla: 'impactante_textura', formato: '9:16', aspecto: '4:5' })
    const cuerpo = (await r.json()) as any
    expect(cuerpo.formato).toBe('9:16')
    expect(cuerpo.url).toContain('download=trk-502-9x16.png')
    expect(m.subidas).toHaveLength(1)
    expect(m.subidas[0]).toMatch(new RegExp(`^${ORGANIZACION_PILOTO_ID}/promociones/${ID_PROMO}/[0-9a-f]{12}\\.png$`))
  })

  it('NO escribe la fila: ni PATCH ni RPC (la placa principal sigue siendo la de promo.aspecto)', async () => {
    const m = mundo()
    await llamar(m, { formato: '1:1' })
    expect(m.escrituras).toEqual([])
  })

  it('cada formato tiene su propio archivo; el mismo formato dos veces, el mismo (idempotente por hash)', async () => {
    const a = mundo(), b = mundo(), c1 = mundo()
    await llamar(a, { formato: '1:1' })
    await llamar(b, { formato: '9:16' })
    await llamar(c1, { formato: '1:1' })
    expect(a.subidas[0]).not.toBe(b.subidas[0])
    expect(a.subidas[0]).toBe(c1.subidas[0])
  })

  it('si el archivo ya existe en Storage (409) no es un error: devuelve la URL igual', async () => {
    const r = await llamar(mundo({ subida: 'ya_existe' }), { formato: '1:1' })
    expect(r.status).toBe(200)
  })

  it('funciona en una promoción aprobada (descargar no cambia nada) y no en una descartada', async () => {
    expect((await llamar(mundo({ promo: { estado: 'aprobada' } }))).status).toBe(200)
    expect((await llamar(mundo({ promo: { estado: 'descartada' } }))).status).toBe(409)
  })

  it('un texto que no entra en ese formato es 422 con el mensaje, sin subir nada', async () => {
    const { ErrorTextoLargo } = await import('./plantillas')
    const m = mundo()
    const r = await llamar(m, { formato: '1:1' }, vi.fn(async () => { throw new ErrorTextoLargo('lugar') }))
    expect(r.status).toBe(422)
    expect(m.subidas).toHaveLength(0)
  })
})
