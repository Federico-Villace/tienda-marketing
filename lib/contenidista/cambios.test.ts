import { describe, it, expect, vi, afterEach } from 'vitest'
import { manejarCambioPieza } from './cambios'
import { HEADER_USUARIO } from '../auth/acceso'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { planDePrueba, piezasDePrueba } from './fixture'

const ID = '22222222-2222-4222-8222-222222222222'
const PLAN_ID = '11111111-1111-4111-8111-111111111111'
const entorno = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_xyz', OPENAI_API_KEY: 'sk-test-SECRETISIMA' }
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })

const base = piezasDePrueba()[1]!
const fila = (o: Record<string, unknown> = {}) => ({
  id: ID, raiz_id: ID, padre_id: null, tanda_id: 't1', plan_id: PLAN_ID, semana: 1, orden: 2, version: 1,
  origen: 'agente', estado: 'borrador', pieza: base, creado_en: '2026-10-21T10:00:00+00:00', aprobado_en: null,
  organizacion_id: ORGANIZACION_PILOTO_ID, ...o,
})

const pedido = (cuerpo: unknown, usuario: string | null = 'u-1') =>
  new Request(`https://app.ejemplo.com/api/piezas/${ID}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(usuario ? { [HEADER_USUARIO]: usuario } : {}) },
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  })

type Mundo = { rol?: string | null; existe?: boolean; rpc?: (nombre: string, args: any) => Response }
function mundo(o: Mundo = {}) {
  const rpcs: { nombre: string; args: any }[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    if (url.hostname === 'api.openai.com') throw new Error('no se llama a OpenAI')
    if (url.pathname === '/rest/v1/miembros') return json(o.rol === null ? [] : [{ rol: o.rol ?? 'director' }])
    if (url.pathname === '/rest/v1/piezas') return json(o.existe === false ? [] : [fila()])
    if (url.pathname === '/rest/v1/planes') return json([{ id: PLAN_ID, estado: 'aprobado', plan: planDePrueba() }])
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const nombre = url.pathname.split('/').pop()!
      const args = JSON.parse(String(init?.body))
      rpcs.push({ nombre, args })
      return (o.rpc ?? (() => json(fila({ estado: 'aprobada', aprobado_en: '2026-10-21T11:00:00+00:00' }))))(nombre, args)
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, rpcs }
}

afterEach(() => vi.restoreAllMocks())

describe('acceso (S43)', () => {
  it('sin sesión 401, lector 403, sin tocar la base', async () => {
    const m = mundo()
    expect((await manejarCambioPieza(pedido({ accion: 'aprobar', version: 1 }, null), ID, entorno, m.f)).status).toBe(401)
    const m2 = mundo({ rol: 'lector' })
    expect((await manejarCambioPieza(pedido({ accion: 'aprobar', version: 1 }), ID, entorno, m2.f)).status).toBe(403)
    expect(m2.rpcs).toHaveLength(0)
  })
  it('un id que no es UUID es 400 y una pieza inexistente 404', async () => {
    const m = mundo()
    expect((await manejarCambioPieza(pedido({ accion: 'aprobar', version: 1 }), 'abc', entorno, m.f)).status).toBe(400)
    const m2 = mundo({ existe: false })
    expect((await manejarCambioPieza(pedido({ accion: 'aprobar', version: 1 }), ID, entorno, m2.f)).status).toBe(404)
  })
  it('un body sin versión, con una acción desconocida o roto es 400', async () => {
    for (const c of [{ accion: 'aprobar' }, { accion: 'borrar', version: 1 }, { version: 1 }, 'no json', { accion: 'aprobar', version: 0 }]) {
      const m = mundo()
      expect((await manejarCambioPieza(pedido(c), ID, entorno, m.f)).status).toBe(400)
      expect(m.rpcs).toHaveLength(0)
    }
  })
})

describe('aprobar y descartar (S39, S40)', () => {
  it('aprobar llama a aprobar_pieza con la versión y el usuario, sin OpenAI', async () => {
    const m = mundo()
    const r = await manejarCambioPieza(pedido({ accion: 'aprobar', version: 1 }), ID, entorno, m.f)
    expect(r.status).toBe(200)
    expect(((await r.json()) as any).pieza.estado).toBe('aprobada')
    expect(m.rpcs).toEqual([{ nombre: 'aprobar_pieza', args: { p_id: ID, p_version: 1, p_usuario: 'u-1' } }])
  })
  it('descartar llama a descartar_pieza', async () => {
    const m = mundo({ rpc: () => json(fila({ estado: 'descartada' })) })
    const r = await manejarCambioPieza(pedido({ accion: 'descartar', version: 1 }), ID, entorno, m.f)
    expect(r.status).toBe(200)
    expect(m.rpcs[0]).toEqual({ nombre: 'descartar_pieza', args: { p_id: ID, p_version: 1 } })
  })
  it('S42/S44 PT409 de la base es 409; PT404 es 404', async () => {
    const m = mundo({ rpc: () => json({ message: 'Esta pieza cambió' }, 409) })
    expect((await manejarCambioPieza(pedido({ accion: 'aprobar', version: 1 }), ID, entorno, m.f)).status).toBe(409)
    const m2 = mundo({ rpc: () => json({ message: 'no existe' }, 404) })
    expect((await manejarCambioPieza(pedido({ accion: 'aprobar', version: 1 }), ID, entorno, m2.f)).status).toBe(404)
  })
  it('un error inesperado de la base es 500 sin filtrar detalles', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = mundo({ rpc: () => json({ message: 'boom interno' }, 500) })
    const r = await manejarCambioPieza(pedido({ accion: 'aprobar', version: 1 }), ID, entorno, m.f)
    expect(r.status).toBe(500)
    expect(await r.text()).not.toContain('boom')
  })
})

describe('editar (S41)', () => {
  it('una edición válida crea la versión nueva por editar_pieza con costo 0 y sin OpenAI', async () => {
    const m = mundo({ rpc: () => json(fila({ id: 'nuevo', version: 2, origen: 'edicion', padre_id: ID })) })
    const editada = { ...base, copy: 'Texto corregido a mano $ 9.999.999' }
    const r = await manejarCambioPieza(pedido({ pieza: editada, version: 1 }), ID, entorno, m.f)
    expect(r.status).toBe(200)
    expect(((await r.json()) as any).pieza.version).toBe(2)
    expect(m.rpcs[0]).toEqual({ nombre: 'editar_pieza', args: { p_id: ID, p_version: 1, p_pieza: editada, p_usuario: 'u-1' } })
  })
  it('pasa por el validador: límites de Meta y claves de más dan 422 con errores y sin RPC', async () => {
    const m = mundo()
    const r = await manejarCambioPieza(pedido({ pieza: { ...base, copy: 'a'.repeat(2201), hashtags: [] }, version: 1 }), ID, entorno, m.f)
    expect(r.status).toBe(422)
    expect(((await r.json()) as any).errores.length).toBeGreaterThan(0)
    const r2 = await manejarCambioPieza(pedido({ pieza: { ...base, extra: 1 }, version: 1 }), ID, entorno, m.f)
    expect(r2.status).toBe(422)
    expect(m.rpcs).toHaveLength(0)
  })
  it('plataforma, formato e ideaOrigen no se pueden cambiar', async () => {
    const m = mundo()
    const r = await manejarCambioPieza(pedido({ pieza: { ...base, plataforma: 'facebook' }, version: 1 }), ID, entorno, m.f)
    expect(r.status).toBe(422)
  })
  it('S42 si la versión que la persona veía no es la de la base, 409 sin RPC', async () => {
    const m = mundo()
    const r = await manejarCambioPieza(pedido({ pieza: base, version: 3 }), ID, entorno, m.f)
    expect(r.status).toBe(409)
    expect(m.rpcs).toHaveLength(0)
  })
})
