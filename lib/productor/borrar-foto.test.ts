import { describe, it, expect, vi } from 'vitest'
import { HEADER_USUARIO } from '../auth/acceso'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { manejarBorradoFoto } from './borrar-foto'

const ID = '77777777-7777-4777-8777-777777777777'
const RUTA = `${ORGANIZACION_PILOTO_ID}/${ID}.jpg`
const entorno = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_xyz' }

type Mundo = { rol?: string | null; foto?: { id: string; ruta: string | null; borrada_en: string | null } | null; borrado?: number }
function mundo(o: Mundo = {}) {
  const llamadas: { metodo: string; ruta: string; params: Record<string, string>; cuerpo?: any }[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    const metodo = init?.method ?? 'GET'
    if (url.hostname.includes('googleapis')) throw new Error('Borrar no llama a Gemini')
    if (url.pathname === '/rest/v1/miembros') return Response.json(o.rol === null ? [] : [{ rol: o.rol ?? 'director' }])
    llamadas.push({
      metodo,
      ruta: url.pathname,
      params: Object.fromEntries(url.searchParams),
      cuerpo: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    })
    if (url.pathname === '/rest/v1/fotos' && metodo === 'GET') {
      const foto = o.foto === undefined ? { id: ID, ruta: RUTA, borrada_en: null } : o.foto
      return Response.json(foto ? [foto] : [])
    }
    if (url.pathname === '/rest/v1/fotos' && metodo === 'PATCH') return new Response(null, { status: 204 })
    if (url.pathname === '/storage/v1/object/fotos' && metodo === 'DELETE') {
      return o.borrado ? new Response('{"message":"boom"}', { status: o.borrado }) : new Response('[]', { status: 200 })
    }
    throw new Error(`URL inesperada: ${metodo} ${url}`)
  })
  return { f, llamadas, patches: () => llamadas.filter((l) => l.metodo === 'PATCH'), storage: () => llamadas.filter((l) => l.ruta.startsWith('/storage/')) }
}
const pedido = (usuario: string | null = 'u-1') =>
  new Request(`https://app.ejemplo.com/api/fotos/${ID}`, { method: 'DELETE', headers: usuario ? { [HEADER_USUARIO]: usuario } : {} })
const borrar = (m: ReturnType<typeof mundo>, id = ID, usuario: string | null = 'u-1') =>
  manejarBorradoFoto(pedido(usuario), id, entorno, m.f, () => Date.parse('2026-10-27T15:00:00Z'))

describe('DELETE /api/fotos/[id] (F11)', () => {
  it('sin sesión 401 y lector 403, sin tocar nada', async () => {
    expect((await borrar(mundo(), ID, null)).status).toBe(401)
    const l = mundo({ rol: 'lector' })
    expect((await borrar(l)).status).toBe(403)
    expect(l.patches()).toHaveLength(0)
    expect(l.storage()).toHaveLength(0)
  })

  it('un id que no es UUID o una foto inexistente (o de otra organización) es 404', async () => {
    const a = mundo()
    expect((await borrar(a, 'abc')).status).toBe(404)
    const b = mundo({ foto: null })
    expect((await borrar(b)).status).toBe(404)
    const sel = b.llamadas.find((l) => l.metodo === 'GET' && l.ruta === '/rest/v1/fotos')!
    expect(sel.params.organizacion_id).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
    expect(b.storage()).toHaveLength(0)
  })

  it('marca borrada, borra el objeto y recién después deja ruta en null', async () => {
    const m = mundo()
    const r = await borrar(m)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, pendiente: false })
    const [primero, segundo] = m.patches()
    expect(primero!.cuerpo).toEqual({ borrada_en: '2026-10-27T15:00:00.000Z', borrada_por: 'u-1' })
    expect(segundo!.cuerpo).toEqual({ ruta: null })
    const borrado = m.storage()[0]!
    expect(borrado.cuerpo).toEqual({ prefixes: [RUTA] })
    const orden = m.llamadas.filter((l) => l.metodo !== 'GET').map((l) => `${l.metodo} ${l.ruta}`)
    expect(orden).toEqual(['PATCH /rest/v1/fotos', 'DELETE /storage/v1/object/fotos', 'PATCH /rest/v1/fotos'])
  })

  it('ya borrada: 200 idempotente, sin tocar nada', async () => {
    const m = mundo({ foto: { id: ID, ruta: null, borrada_en: '2026-10-26T10:00:00Z' } })
    const r = await borrar(m)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, pendiente: false })
    expect(m.patches()).toHaveLength(0)
    expect(m.storage()).toHaveLength(0)
  })

  it('borrada pero con la ruta todavía (reintento): borra el objeto y limpia la ruta, sin pisar borrada_en', async () => {
    const m = mundo({ foto: { id: ID, ruta: RUTA, borrada_en: '2026-10-26T10:00:00Z' } })
    const r = await borrar(m)
    expect(r.status).toBe(200)
    expect(m.storage()).toHaveLength(1)
    expect(m.patches().map((p) => p.cuerpo)).toEqual([{ ruta: null }])
  })

  it('si falla el borrado del objeto: log, 200 con pendiente:true y la ruta se conserva', async () => {
    const m = mundo({ borrado: 500 })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await borrar(m)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, pendiente: true })
    expect(m.patches()).toHaveLength(1) // solo la marca; la ruta NO se limpia
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('las generaciones y creativos derivados no se tocan', async () => {
    const m = mundo()
    await borrar(m)
    expect(m.llamadas.some((l) => l.ruta.includes('generaciones') || l.ruta.includes('creativos') && !l.ruta.startsWith('/storage'))).toBe(false)
  })
})
