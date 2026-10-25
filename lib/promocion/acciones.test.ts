import { describe, it, expect, vi, afterEach } from 'vitest'
import { manejarCambio } from './cambios'
import { hashPlaca } from './placa'
import { HEADER_USUARIO } from '../auth/acceso'
import { MARCAS } from '../datos/marcas'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { copyDePrueba, filaPromocion, ID_ESCENA, ID_FOTO, ID_PROMO } from './fixture'

const entorno = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_xyz', GEMINI_API_KEY: 'AIza-X', OPENAI_API_KEY: 'sk-X' }
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 9])
const RUTA_ESCENA = `${ORGANIZACION_PILOTO_ID}/gen-1/1.jpg`

const completa = (o: Record<string, unknown> = {}) =>
  filaPromocion({
    id: ID_PROMO,
    marca_id: MARCAS[3]!.id,
    foto_id: ID_FOTO,
    revision: 4,
    plantilla: 'oferta_abajo',
    fondo: 'fondo_estudio',
    copy: copyDePrueba(),
    copy_opcion: 1,
    titular: 'Tu próxima aventura',
    escena_creativo_id: ID_ESCENA,
    ...o,
  } as never)

const pedido = (cuerpo: unknown, usuario: string | null = 'u-1') =>
  new Request(`https://app.ejemplo.com/api/promociones/${ID_PROMO}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(usuario ? { [HEADER_USUARIO]: usuario } : {}) },
    body: JSON.stringify(cuerpo),
  })

type Mundo = { rol?: string | null; promo?: Record<string, unknown>; rpc?: (nombre: string, a: any) => Response }
function mundo(o: Mundo = {}) {
  const rpcs: { nombre: string; args: any }[] = []
  const subidas: string[] = []
  let leidas = 0
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    if (url.hostname !== 'abc.supabase.co') throw new Error(`no se llama a ${url.hostname}`)
    const p = url.pathname
    if (p === '/rest/v1/miembros') return json(o.rol === null ? [] : [{ rol: o.rol ?? 'director' }])
    if (p === '/rest/v1/promociones') {
      leidas += 1
      // Después de una RPC exitosa la fila ya cambió: la relectura trae el estado nuevo.
      const aprobada = rpcs.some((r) => r.nombre === 'aprobar_promocion')
      const reabierta = rpcs.some((r) => r.nombre === 'reabrir_promocion')
      return json([completa({ ...(o.promo ?? {}), ...(aprobada ? { estado: 'aprobada', revision: 5, placa_ruta: 'r', placa_hash: 'h' } : {}), ...(reabierta ? { estado: 'borrador', revision: 6 } : {}) })])
    }
    if (p === '/rest/v1/creativos') return json([{ id: ID_ESCENA, ruta: RUTA_ESCENA, mime_type: 'image/jpeg', generaciones: { promocion_id: ID_PROMO } }])
    if (p.startsWith('/storage/v1/object/authenticated/creativos/')) return new Response(Uint8Array.from([0xff, 0xd8, 0xff]))
    if (p === '/storage/v1/object/sign/creativos') {
      const b = JSON.parse(String(init?.body))
      return json(b.paths.map((x: string) => ({ path: x, signedURL: `/object/sign/creativos/${x}?token=T`, error: null })))
    }
    if (p.startsWith('/storage/v1/object/creativos/')) {
      subidas.push(p)
      return json({ Key: 'x' })
    }
    if (p.startsWith('/rest/v1/rpc/')) {
      const nombre = p.split('/').pop()!
      const args = JSON.parse(String(init?.body))
      rpcs.push({ nombre, args })
      if (o.rpc) return o.rpc(nombre, args)
      if (nombre === 'aprobar_promocion') return json({ id: 'ap1', promocion_id: ID_PROMO, version: 1, aprobado_por: 'u-1', aprobado_en: '2026-10-25T16:00:00+00:00', placa_ruta: args.p_placa_ruta, snapshot: {} })
      return json(completa({ estado: nombre === 'descartar_promocion' ? 'descartada' : 'borrador', revision: args.p_revision + 1 }))
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, rpcs, subidas, leidas: () => leidas }
}
const componer = () => vi.fn(async (_p: unknown) => PNG)
const llamar = (m: ReturnType<typeof mundo>, cuerpo: unknown, c = componer(), usuario: string | null = 'u-1') =>
  manejarCambio(pedido(cuerpo, usuario), ID_PROMO, entorno, m.f, c as never)

afterEach(() => vi.restoreAllMocks())

describe('forma de la acción', () => {
  it('una acción desconocida es 400', async () => {
    const m = mundo()
    expect((await llamar(m, { accion: 'borrar', revision: 4 })).status).toBe(400)
    expect(m.rpcs).toHaveLength(0)
  })
  it('una acción no se mezcla con otros cambios', async () => {
    const m = mundo()
    const r = await llamar(m, { accion: 'aprobar', revision: 4, titular: 'otro' })
    expect(r.status).toBe(400)
    expect(m.rpcs).toHaveLength(0)
  })
  it('sin sesión 401 y lector 403, en las tres', async () => {
    for (const accion of ['aprobar', 'reabrir', 'descartar']) {
      expect((await llamar(mundo(), { accion, revision: 4 }, componer(), null)).status).toBe(401)
      const m = mundo({ rol: 'lector' })
      expect((await llamar(m, { accion, revision: 4 })).status, accion).toBe(403)
      expect(m.rpcs).toHaveLength(0)
    }
  })
})

describe('aprobar', () => {
  it('compone la placa, la sube y aprueba con aprobar_promocion; devuelve la promoción aprobada y la versión', async () => {
    const c = componer()
    const m = mundo()
    const r = await llamar(m, { accion: 'aprobar', revision: 4 }, c)
    expect(r.status).toBe(200)
    expect(c).toHaveBeenCalledTimes(1)
    expect(m.subidas).toHaveLength(1)
    expect(m.rpcs).toHaveLength(1)
    expect(m.rpcs[0]).toEqual({
      nombre: 'aprobar_promocion',
      args: { p_id: ID_PROMO, p_revision: 4, p_placa_ruta: expect.stringContaining(`/promociones/${ID_PROMO}/`), p_placa_hash: expect.stringMatching(/^[0-9a-f]{64}$/), p_usuario: 'u-1' },
    })
    const b = (await r.json()) as any
    expect(b.promocion.estado).toBe('aprobada')
    expect(b.aprobacion).toMatchObject({ id: 'ap1', version: 1 })
    expect(b.url).toContain('/object/sign/creativos/')
    expect(JSON.stringify(b.promocion)).not.toContain(ORGANIZACION_PILOTO_ID)
  })

  it('el operador también aprueba', async () => {
    expect((await llamar(mundo({ rol: 'operador' }), { accion: 'aprobar', revision: 4 })).status).toBe(200)
  })

  it('si la placa vigente coincide con lo que hay, la reusa: no compone ni sube', async () => {
    const { hash } = hashPlaca(completa())
    const c = componer()
    const m = mundo({ promo: { placa_hash: hash, placa_ruta: `${ORGANIZACION_PILOTO_ID}/promociones/${ID_PROMO}/${hash.slice(0, 12)}.png` } })
    const r = await llamar(m, { accion: 'aprobar', revision: 4 }, c)
    expect(r.status).toBe(200)
    expect(c).not.toHaveBeenCalled()
    expect(m.subidas).toHaveLength(0)
    expect(m.rpcs[0]!.args.p_placa_hash).toBe(hash)
  })

  it('si falta algo, 422 con qué falta y sin tocar nada', async () => {
    for (const [falta, patron] of [[{ copy: null, titular: null }, /texto/], [{ escena_creativo_id: null }, /imagen/], [{ plantilla: null }, /diseño/]] as const) {
      const c = componer()
      const m = mundo({ promo: falta })
      const r = await llamar(m, { accion: 'aprobar', revision: 4 }, c)
      expect(r.status).toBe(422)
      expect(((await r.json()) as any).error).toMatch(patron)
      expect(c).not.toHaveBeenCalled()
      expect(m.rpcs).toHaveLength(0)
    }
  })

  it('doble click: lo que ya está aprobado devuelve 409 y no crea otra versión', async () => {
    const m = mundo({ promo: { estado: 'aprobada', revision: 5 } })
    const r = await llamar(m, { accion: 'aprobar', revision: 4 })
    expect(r.status).toBe(409)
    expect(m.rpcs).toHaveLength(0)
  })

  it('una revisión vieja es 409 sin componer', async () => {
    const c = componer()
    const m = mundo({ promo: { revision: 9 } })
    expect((await llamar(m, { accion: 'aprobar', revision: 4 }, c)).status).toBe(409)
    expect(c).not.toHaveBeenCalled()
  })

  it('si la base responde 409 (carrera) o 422, se traduce', async () => {
    expect((await llamar(mundo({ rpc: () => json({ message: 'cambió' }, 409) }), { accion: 'aprobar', revision: 4 })).status).toBe(409)
    const r = await llamar(mundo({ rpc: () => json({ message: 'Falta' }, 422) }), { accion: 'aprobar', revision: 4 })
    expect(r.status).toBe(422)
  })

  it('un texto que no entra es 422 y no aprueba', async () => {
    const { ErrorTextoLargo } = await import('./plantillas')
    const m = mundo()
    const r = await llamar(m, { accion: 'aprobar', revision: 4 }, vi.fn(async () => { throw new ErrorTextoLargo('titular') }))
    expect(r.status).toBe(422)
    expect(m.rpcs).toHaveLength(0)
  })

  it('no llama a ningún modelo: aprobar es gratis', async () => {
    const m = mundo()
    await llamar(m, { accion: 'aprobar', revision: 4 })
    expect(new Set(m.f.mock.calls.map(([u]) => new URL(String(u)).hostname))).toEqual(new Set(['abc.supabase.co']))
  })
})

describe('volver a editar y descartar', () => {
  it('reabrir llama a reabrir_promocion con la revisión y devuelve el borrador', async () => {
    const m = mundo({ promo: { estado: 'aprobada', revision: 5 } })
    const r = await llamar(m, { accion: 'reabrir', revision: 5 })
    expect(r.status).toBe(200)
    expect(m.rpcs).toEqual([{ nombre: 'reabrir_promocion', args: { p_id: ID_PROMO, p_revision: 5, p_usuario: 'u-1' } }])
    expect(((await r.json()) as any).promocion.estado).toBe('borrador')
  })
  it('un borrador no se reabre (409)', async () => {
    const m = mundo()
    expect((await llamar(m, { accion: 'reabrir', revision: 4 })).status).toBe(409)
    expect(m.rpcs).toHaveLength(0)
  })
  it('descartar llama a descartar_promocion', async () => {
    const m = mundo()
    const r = await llamar(m, { accion: 'descartar', revision: 4 })
    expect(r.status).toBe(200)
    expect(m.rpcs).toEqual([{ nombre: 'descartar_promocion', args: { p_id: ID_PROMO, p_revision: 4, p_usuario: 'u-1' } }])
    expect(((await r.json()) as any).promocion.estado).toBe('descartada')
  })
  it('una aprobada no se descarta: primero hay que volver a editar', async () => {
    const m = mundo({ promo: { estado: 'aprobada', revision: 5 } })
    expect((await llamar(m, { accion: 'descartar', revision: 5 })).status).toBe(409)
    expect(m.rpcs).toHaveLength(0)
  })
  it('revisión vieja 409 en las dos', async () => {
    expect((await llamar(mundo({ promo: { estado: 'aprobada', revision: 8 } }), { accion: 'reabrir', revision: 5 })).status).toBe(409)
    expect((await llamar(mundo({ promo: { revision: 8 } }), { accion: 'descartar', revision: 4 })).status).toBe(409)
  })
})
