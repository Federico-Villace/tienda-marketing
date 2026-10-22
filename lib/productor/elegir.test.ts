import { describe, it, expect, vi } from 'vitest'
import { HEADER_USUARIO } from '../auth/acceso'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { manejarElegir } from './elegir'

const ID = '55555555-5555-4555-8555-555555555555'
const entorno = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_xyz' }

type Mundo = { rol?: string | null; existe?: boolean; rpc?: (args: any) => Response }
function mundo(o: Mundo = {}) {
  const rpcs: any[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    if (url.hostname.includes('googleapis')) throw new Error('Elegir no llama a Gemini')
    if (url.pathname === '/rest/v1/miembros') return Response.json(o.rol === null ? [] : [{ rol: o.rol ?? 'director' }])
    if (url.pathname === '/rest/v1/creativos') {
      expect(url.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
      return Response.json(o.existe === false ? [] : [{ id: ID }])
    }
    if (url.pathname === '/rest/v1/rpc/elegir_creativo') {
      const args = JSON.parse(String(init!.body))
      rpcs.push(args)
      return (o.rpc ?? (() => Response.json({ id: ID, orden: 2, pieza_raiz_id: 'r', elegida: args.p_elegida, ruta: 'a/b.jpg' })))(args)
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, rpcs }
}
const pedido = (cuerpo: unknown, usuario: string | null = 'u-1') =>
  new Request(`https://app.ejemplo.com/api/creativos/${ID}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(usuario ? { [HEADER_USUARIO]: usuario } : {}) },
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  })

describe('PATCH /api/creativos/[id] (R10)', () => {
  it('S10.1 marca la imagen con el usuario de la sesión y devuelve el creativo', async () => {
    const m = mundo()
    const r = await manejarElegir(pedido({ elegida: true }, 'u-3'), ID, entorno, m.f)
    expect(r.status).toBe(200)
    expect(m.rpcs).toEqual([{ p_id: ID, p_elegida: true, p_usuario: 'u-3' }])
    expect((await r.json()).creativo).toEqual({ id: ID, orden: 2, piezaRaizId: 'r', elegida: true })
  })

  it('permite quitar la elección', async () => {
    const m = mundo()
    const r = await manejarElegir(pedido({ elegida: false }), ID, entorno, m.f)
    expect((await r.json()).creativo.elegida).toBe(false)
  })

  it('no exige GEMINI_API_KEY ni tope (no cuesta plata)', async () => {
    const m = mundo()
    expect((await manejarElegir(pedido({ elegida: true }), ID, entorno, m.f)).status).toBe(200)
  })

  it('S10.2 sin sesión 401 y lector 403, sin llamar a la RPC', async () => {
    const m = mundo()
    expect((await manejarElegir(pedido({ elegida: true }, null), ID, entorno, m.f)).status).toBe(401)
    const l = mundo({ rol: 'lector' })
    expect((await manejarElegir(pedido({ elegida: true }), ID, entorno, l.f)).status).toBe(403)
    expect(l.rpcs).toHaveLength(0)
  })

  it('S10.3 un creativo ajeno o inexistente, o un id que no es UUID, es 404', async () => {
    const m = mundo({ existe: false })
    expect((await manejarElegir(pedido({ elegida: true }), ID, entorno, m.f)).status).toBe(404)
    expect((await manejarElegir(pedido({ elegida: true }), 'abc', entorno, mundo().f)).status).toBe(404)
    expect(m.rpcs).toHaveLength(0)
  })

  it('S10.4 un creativo sin imagen (PT409 de la RPC) es 409', async () => {
    const m = mundo({ rpc: () => new Response('{"message":"Ese creativo no tiene imagen"}', { status: 409 }) })
    expect((await manejarElegir(pedido({ elegida: true }), ID, entorno, m.f)).status).toBe(409)
  })

  it('un creativo de foto (PT422 de la RPC) es 422 con un mensaje claro', async () => {
    const m = mundo({ rpc: () => new Response('{"message":"Las imágenes de una foto no se eligen todavía"}', { status: 422 }) })
    const r = await manejarElegir(pedido({ elegida: true }), ID, entorno, m.f)
    expect(r.status).toBe(422)
    expect((await r.json()).error).toBe('Las imágenes de una foto no se eligen todavía.')
  })

  it('un body inválido es 400 sin llamar a la RPC', async () => {
    const m = mundo()
    for (const cuerpo of [{ elegida: 'si' }, {}, '{roto', 'null']) {
      expect((await manejarElegir(pedido(cuerpo), ID, entorno, m.f)).status).toBe(400)
    }
    expect(m.rpcs).toHaveLength(0)
  })

  it('una falla inesperada es 500 genérico', async () => {
    const m = mundo({ rpc: () => new Response('{"message":"boom"}', { status: 500 }) })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await manejarElegir(pedido({ elegida: true }), ID, entorno, m.f)
    expect(r.status).toBe(500)
    expect(JSON.stringify(await r.json())).not.toContain('boom')
    spy.mockRestore()
  })
})
