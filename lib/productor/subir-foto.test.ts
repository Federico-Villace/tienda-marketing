// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { HEADER_USUARIO } from '../auth/acceso'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { DECLARACION_DERECHOS_V1, LIMITES_FOTO } from './foto'
import { jpegDePrueba } from './foto-fixture'
import { manejarSubidaFoto } from './subir-foto'

const FOTO_ID = '77777777-7777-4777-8777-777777777777'
const CLAVE = 'sb_secret_xyz'
const entorno = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: CLAVE }
const AHORA = Date.parse('2026-10-27T15:00:00Z')

type Mundo = { rol?: string | null; subida?: number; insert?: number; firma?: boolean }
function mundo(o: Mundo = {}) {
  const llamadas: { metodo: string; ruta: string; cuerpo?: any }[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    const metodo = init?.method ?? 'GET'
    if (url.hostname.includes('googleapis')) throw new Error('Subir no llama a Gemini')
    if (url.pathname === '/rest/v1/miembros') return Response.json(o.rol === null ? [] : [{ rol: o.rol ?? 'director' }])
    llamadas.push({ metodo, ruta: url.pathname, cuerpo: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body })
    if (url.pathname.startsWith('/storage/v1/object/sign/')) {
      return o.firma === false
        ? new Response('{}', { status: 500 })
        : Response.json([{ path: `${ORGANIZACION_PILOTO_ID}/${FOTO_ID}.jpg`, signedURL: `/object/sign/fotos/x.jpg?token=T` }])
    }
    if (url.pathname.startsWith('/storage/v1/object/fotos') && metodo === 'POST') {
      return o.subida ? new Response(`{"message":"mala ${CLAVE}"}`, { status: o.subida }) : new Response('{}', { status: 200 })
    }
    if (url.pathname.startsWith('/storage/v1/object/fotos') && metodo === 'DELETE') return new Response('[]', { status: 200 })
    if (url.pathname === '/rest/v1/fotos') {
      return o.insert ? new Response('{"message":"boom"}', { status: o.insert }) : Response.json([JSON.parse(String(init!.body))])
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, llamadas, storage: () => llamadas.filter((l) => l.ruta.startsWith('/storage/')), inserts: () => llamadas.filter((l) => l.ruta === '/rest/v1/fotos') }
}

type Parte = { foto?: Uint8Array | null; derechos?: string | null; extra?: Record<string, string> }
function pedido(p: Parte = {}, usuario: string | null = 'u-1', headers: Record<string, string> = {}) {
  const fd = new FormData()
  if (p.foto !== null) fd.set('foto', new File([(p.foto ?? jpegDePrueba(1536, 2048)) as BlobPart], 'foto.jpg', { type: 'image/jpeg' }))
  if (p.derechos !== null) fd.set('derechos', p.derechos ?? 'acepto')
  for (const [k, v] of Object.entries(p.extra ?? {})) fd.set(k, v)
  return new Request('https://app.ejemplo.com/api/fotos', {
    method: 'POST',
    headers: { ...(usuario ? { [HEADER_USUARIO]: usuario } : {}), ...headers },
    body: fd,
  })
}
const subir = (r: Request, m: ReturnType<typeof mundo>) => manejarSubidaFoto(r, entorno, m.f, () => FOTO_ID, () => AHORA)

describe('POST /api/fotos (F7)', () => {
  it('S7.7 sin sesión 401, lector 403, sin variables 500; sin tocar Storage', async () => {
    const m = mundo()
    expect((await subir(pedido({}, null), m)).status).toBe(401)
    const l = mundo({ rol: 'lector' })
    expect((await subir(pedido(), l)).status).toBe(403)
    expect(l.storage()).toHaveLength(0)
    expect((await manejarSubidaFoto(pedido(), {}, mundo().f, () => FOTO_ID, () => AHORA)).status).toBe(500)
  })

  it('413 por content-length ANTES de parsear el cuerpo', async () => {
    const m = mundo()
    const req = pedido({}, 'u-1', { 'content-length': String(LIMITES_FOTO.maxContentLength + 1) })
    const spy = vi.spyOn(req, 'formData')
    const r = await subir(req, m)
    expect(r.status).toBe(413)
    expect(spy).not.toHaveBeenCalled()
    expect(m.storage()).toHaveLength(0)
  })

  it('un cuerpo que no es multipart es 400', async () => {
    const m = mundo()
    const req = new Request('https://app.ejemplo.com/api/fotos', { method: 'POST', headers: { [HEADER_USUARIO]: 'u-1' }, body: 'hola' })
    expect((await subir(req, m)).status).toBe(400)
  })

  it('S7.2 sin el checkbox de derechos es 422 y no hay NINGÚN pedido a Storage', async () => {
    for (const derechos of [null, '', 'si', 'true', 'ACEPTO']) {
      const m = mundo()
      const r = await subir(pedido({ derechos }), m)
      expect(r.status).toBe(422)
      expect((await r.json()).error).toBe('Tenés que confirmar que tenés derecho a usar esta foto.')
      expect(m.storage()).toHaveLength(0)
      expect(m.inserts()).toHaveLength(0)
    }
  })

  it('sin archivo "foto" (o con un texto en su lugar) es 400', async () => {
    const m = mundo()
    expect((await subir(pedido({ foto: null }), m)).status).toBe(400)
    expect((await subir(pedido({ foto: null, extra: { foto: 'texto' } }), m)).status).toBe(400)
    expect(m.storage()).toHaveLength(0)
  })

  it('S7.3 la validación del archivo propaga 415, 422, 413 y 400 sin subir nada', async () => {
    const m = mundo()
    const png = new Uint8Array(33)
    png.set([0x89, 0x50, 0x4e, 0x47], 0)
    expect((await subir(pedido({ foto: png }), m)).status).toBe(415)
    expect((await subir(pedido({ foto: jpegDePrueba(4000, 3000) }), m)).status).toBe(422)
    expect((await subir(pedido({ foto: jpegDePrueba(1024, 1024, LIMITES_FOTO.maxBytes) }), m)).status).toBe(413)
    expect((await subir(pedido({ foto: new Uint8Array() }), m)).status).toBe(400)
    expect(m.storage()).toHaveLength(0)
    expect(m.inserts()).toHaveLength(0)
  })

  it('S7.1 camino feliz: sube a fotos/{org}/{uuid}.jpg, inserta la fila con la declaración y responde 201 con la URL firmada', async () => {
    const m = mundo()
    const r = await subir(pedido(), m)
    expect(r.status).toBe(201)
    const subida = m.storage().find((l) => l.metodo === 'POST' && !l.ruta.includes('/sign/'))!
    expect(subida.ruta).toBe(`/storage/v1/object/fotos/${ORGANIZACION_PILOTO_ID}/${FOTO_ID}.jpg`)
    expect(m.inserts()).toHaveLength(1)
    expect(m.inserts()[0]!.cuerpo).toEqual({
      id: FOTO_ID,
      organizacion_id: ORGANIZACION_PILOTO_ID,
      ruta: `${ORGANIZACION_PILOTO_ID}/${FOTO_ID}.jpg`,
      mime_type: 'image/jpeg',
      ancho: 1536,
      alto: 2048,
      bytes: 21,
      subida_por: 'u-1',
      derechos_por: 'u-1',
      derechos_en: '2026-10-27T15:00:00.000Z',
      derechos_version: DECLARACION_DERECHOS_V1.version,
      uso: 'moto',
    })
    // la subida va ANTES del insert
    const orden = m.llamadas.map((l) => l.ruta)
    expect(orden.indexOf(subida.ruta)).toBeLessThan(orden.indexOf('/rest/v1/fotos'))
    const cuerpo = await r.json()
    expect(cuerpo).toEqual({
      foto: { id: FOTO_ID, ancho: 1536, alto: 2048, url: 'https://abc.supabase.co/storage/v1/object/sign/fotos/x.jpg?token=T' },
    })
  })

  it('una foto de inspiración pasa por el MISMO camino y queda registrada con uso "inspiracion" y su declaración de derechos', async () => {
    const m = mundo()
    const r = await subir(pedido({ extra: { uso: 'inspiracion' } }), m)
    expect(r.status).toBe(201)
    expect(m.inserts()[0]!.cuerpo).toMatchObject({ uso: 'inspiracion', derechos_por: 'u-1', derechos_version: DECLARACION_DERECHOS_V1.version, ruta: `${ORGANIZACION_PILOTO_ID}/${FOTO_ID}.jpg` })
  })

  it('la de inspiración también exige el checkbox: sin él no hay NINGÚN pedido a Storage', async () => {
    const m = mundo()
    const r = await subir(pedido({ derechos: null, extra: { uso: 'inspiracion' } }), m)
    expect(r.status).toBe(422)
    expect(m.storage()).toHaveLength(0)
    expect(m.inserts()).toHaveLength(0)
  })

  it('un uso desconocido es 400 sin tocar Storage; vacío o ausente es "moto"', async () => {
    const m = mundo()
    const r = await subir(pedido({ extra: { uso: 'logo' } }), m)
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe('El uso de la foto no es válido.')
    expect(m.storage()).toHaveLength(0)
    const m2 = mundo()
    await subir(pedido({ extra: { uso: '' } }), m2)
    expect(m2.inserts()[0]!.cuerpo).toMatchObject({ uso: 'moto' })
  })

  it('la de inspiración respeta los mismos límites (415 si no es JPEG)', async () => {
    const m = mundo()
    const png = new Uint8Array(33)
    png.set([0x89, 0x50, 0x4e, 0x47], 0)
    expect((await subir(pedido({ foto: png, extra: { uso: 'inspiracion' } }), m)).status).toBe(415)
    expect(m.storage()).toHaveLength(0)
  })

  it('S7.1 no necesita GEMINI_API_KEY ni tope (subir no gasta)', async () => {
    const m = mundo()
    expect((await subir(pedido(), m)).status).toBe(201)
  })

  it('S7.4 si falla la subida: 500, nada insertado y sin la clave', async () => {
    const m = mundo({ subida: 500 })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await subir(pedido(), m)
    expect(r.status).toBe(500)
    expect(m.inserts()).toHaveLength(0)
    expect(JSON.stringify(await r.json())).not.toContain(CLAVE)
    expect(JSON.stringify(spy.mock.calls)).not.toContain(CLAVE)
    spy.mockRestore()
  })

  it('S7.5 si falla el insert: intenta borrar el objeto y responde 500', async () => {
    const m = mundo({ insert: 500 })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await subir(pedido(), m)
    expect(r.status).toBe(500)
    const borrado = m.storage().find((l) => l.metodo === 'DELETE')!
    expect(borrado.ruta).toBe('/storage/v1/object/fotos')
    expect(borrado.cuerpo).toEqual({ prefixes: [`${ORGANIZACION_PILOTO_ID}/${FOTO_ID}.jpg`] })
    spy.mockRestore()
  })

  it('S7.6 ninguna respuesta lleva la ruta cruda ni la clave', async () => {
    const m = mundo()
    const texto = JSON.stringify(await (await subir(pedido(), m)).json())
    expect(texto).not.toContain(`${ORGANIZACION_PILOTO_ID}/${FOTO_ID}.jpg`)
    expect(texto).not.toContain(CLAVE)
  })

  it('S7.8 un usuarioId, organizacion_id o ruta que venga en el form se ignora', async () => {
    const m = mundo()
    const r = await subir(
      pedido({ extra: { usuarioId: 'otro', organizacion_id: 'otra-org', subida_por: 'otro', ruta: 'x/y.jpg', id: 'zzz' } }),
      m,
    )
    expect(r.status).toBe(201)
    const fila = m.inserts()[0]!.cuerpo
    expect(fila.subida_por).toBe('u-1')
    expect(fila.derechos_por).toBe('u-1')
    expect(fila.organizacion_id).toBe(ORGANIZACION_PILOTO_ID)
    expect(fila.id).toBe(FOTO_ID)
  })

  it('si no se puede firmar la URL, la foto igual se subió: 201 con url null', async () => {
    const m = mundo({ firma: false })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await subir(pedido(), m)
    expect(r.status).toBe(201)
    expect((await r.json()).foto.url).toBeNull()
    spy.mockRestore()
  })
})
