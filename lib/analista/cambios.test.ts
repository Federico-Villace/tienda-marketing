import { describe, it, expect, vi, afterEach } from 'vitest'
import { manejarEdicionAnalisis } from './cambios'
import { HEADER_USUARIO } from '../auth/acceso'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { entradaDePrueba } from './fixture.test-util'

const ID = '22222222-2222-4222-8222-222222222222'
const entorno = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_xyz', OPENAI_API_KEY: 'sk-test-SECRETISIMA' }
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })

const fila = (o: Record<string, unknown> = {}) => ({
  id: ID, contenido: 'Original del modelo', modelo: 'gpt-6-luna', costo_usd: '0.0013', tokens_entrada: 3000, tokens_salida: 2000,
  creado_en: '2026-10-20T15:00:00+00:00', filtros: {}, ...o,
})
const edicion = (o: Record<string, unknown> = {}) => ({
  id: 'e2', analisis_id: ID, version: 2, contenido: 'Texto corregido', editado_por: 'u-1', editado_en: '2026-10-21T10:00:00+00:00',
  organizacion_id: ORGANIZACION_PILOTO_ID, ...o,
})

const pedido = (cuerpo: unknown, usuario: string | null = 'u-1') =>
  new Request(`https://app.ejemplo.com/api/analisis/${ID}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(usuario ? { [HEADER_USUARIO]: usuario } : {}) },
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  })

type Mundo = { rol?: string | null; existe?: boolean; fila?: Record<string, unknown>; rpc?: (args: any) => Response; ediciones?: unknown[] }
function mundo(o: Mundo = {}) {
  const rpcs: { nombre: string; args: any }[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    if (url.hostname === 'api.openai.com' || url.hostname === 'graph.facebook.com') throw new Error('editar no llama a OpenAI ni a Meta')
    if (url.pathname === '/rest/v1/miembros') return json(o.rol === null ? [] : [{ rol: o.rol ?? 'director' }])
    if (url.pathname === '/rest/v1/analisis') return json(o.existe === false ? [] : [fila(o.fila)])
    if (url.pathname === '/rest/v1/ediciones_analisis') return json(o.ediciones ?? [edicion()])
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const args = JSON.parse(String(init?.body))
      rpcs.push({ nombre: url.pathname.split('/').pop()!, args })
      return (o.rpc ?? (() => json(edicion())))(args)
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, rpcs }
}

afterEach(() => vi.restoreAllMocks())

describe('acceso', () => {
  it('sin sesión 401 y lector 403, sin tocar la base', async () => {
    const m = mundo()
    expect((await manejarEdicionAnalisis(pedido({ contenido: 'x', version: 1 }, null), ID, entorno, m.f)).status).toBe(401)
    const m2 = mundo({ rol: 'lector' })
    expect((await manejarEdicionAnalisis(pedido({ contenido: 'x', version: 1 }), ID, entorno, m2.f)).status).toBe(403)
    expect(m2.rpcs).toHaveLength(0)
  })

  it.each(['director', 'operador'])('el rol %s puede editar, sin OPENAI_API_KEY siquiera', async (rol) => {
    const m = mundo({ rol })
    const { OPENAI_API_KEY: _, ...sinClave } = entorno
    expect((await manejarEdicionAnalisis(pedido({ contenido: 'Texto corregido', version: 1 }), ID, sinClave, m.f)).status).toBe(200)
  })
})

describe('validación', () => {
  it('un id que no es UUID es 400 y un análisis inexistente 404', async () => {
    expect((await manejarEdicionAnalisis(pedido({ contenido: 'x', version: 1 }), 'abc', entorno, mundo().f)).status).toBe(400)
    expect((await manejarEdicionAnalisis(pedido({ contenido: 'x', version: 1 }), ID, entorno, mundo({ existe: false }).f)).status).toBe(404)
  })

  it('un body roto, sin versión, sin contenido, vacío o de más de 8000 caracteres es 400 y no escribe', async () => {
    const malos = ['no json', { contenido: 'x' }, { version: 1 }, { contenido: 'x', version: 0 }, { contenido: '   ', version: 1 }, { contenido: 5, version: 1 }, { contenido: 'a'.repeat(8001), version: 1 }]
    for (const c of malos) {
      const m = mundo()
      expect((await manejarEdicionAnalisis(pedido(c), ID, entorno, m.f)).status).toBe(400)
      expect(m.rpcs).toHaveLength(0)
    }
  })
})

describe('edición', () => {
  it('llama a editar_analisis con la versión vista y el usuario, y devuelve la versión vigente', async () => {
    const m = mundo()
    const r = await manejarEdicionAnalisis(pedido({ contenido: '  Texto corregido  ', version: 1 }), ID, entorno, m.f)
    expect(r.status).toBe(200)
    expect(m.rpcs).toEqual([{ nombre: 'editar_analisis', args: { p_id: ID, p_version: 1, p_contenido: 'Texto corregido', p_usuario: 'u-1' } }])
    const { analisis } = await r.json()
    expect(analisis).toMatchObject({ id: ID, contenido: 'Texto corregido', original: 'Original del modelo', version: 2, editadoPor: 'u-1' })
  })

  it('PT409 de la base es 409 y PT404 es 404', async () => {
    const c = (status: number) => mundo({ rpc: () => json({ message: 'x' }, status) })
    expect((await manejarEdicionAnalisis(pedido({ contenido: 'x', version: 1 }), ID, entorno, c(409).f)).status).toBe(409)
    expect((await manejarEdicionAnalisis(pedido({ contenido: 'x', version: 1 }), ID, entorno, c(404).f)).status).toBe(404)
  })

  it('un error inesperado es 500 genérico sin filtrar claves', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = mundo({ rpc: () => json({ message: 'boom' }, 500) })
    const r = await manejarEdicionAnalisis(pedido({ contenido: 'x', version: 1 }), ID, entorno, m.f)
    expect(r.status).toBe(500)
    expect(JSON.stringify(await r.json()) + JSON.stringify(spy.mock.calls)).not.toMatch(/sb_secret|sk-test/)
  })
})

describe('análisis estructurado (analista-v4)', () => {
  const entrada = entradaDePrueba()
  const modelo = { resumen: 'Anduvo bien.', hace: [{ accion: 'Más reels', porque: 'Rinden más', hechos: ['h1'] }], evita: [], proba: [], ideas: [] }
  const estructurada = { fila: { formato: 'estructurado', entrada, contenido: JSON.stringify(modelo) } }

  it('guarda el JSON validado como la versión siguiente y devuelve la vista estructurada', async () => {
    const editado = { ...modelo, resumen: 'Resumen corregido.' }
    const m = mundo({ ...estructurada, ediciones: [edicion({ contenido: JSON.stringify(editado) })] })
    const r = await manejarEdicionAnalisis(pedido({ version: 1, estructurado: editado }), ID, entorno, m.f)
    expect(r.status).toBe(200)
    expect(m.rpcs[0]).toMatchObject({ nombre: 'editar_analisis', args: { p_id: ID, p_version: 1, p_usuario: 'u-1' } })
    expect(JSON.parse(m.rpcs[0]!.args.p_contenido)).toEqual(editado)
    expect((await r.json()).analisis.estructurado.resumen).toBe('Resumen corregido.')
  })

  it('un hecho que no existe en la entrada guardada es 400 y no escribe (no se agregan datos nuevos)', async () => {
    const m = mundo(estructurada)
    const r = await manejarEdicionAnalisis(pedido({ version: 1, estructurado: { ...modelo, hace: [{ accion: 'x', porque: 'y', hechos: ['h9999'] }] } }), ID, entorno, m.f)
    expect(r.status).toBe(400)
    expect(m.rpcs).toHaveLength(0)
  })

  it('quitar ítems sí se puede; dejarlo sin ninguno no', async () => {
    const m = mundo(estructurada)
    expect((await manejarEdicionAnalisis(pedido({ version: 1, estructurado: { ...modelo, hace: [] } }), ID, entorno, m.f)).status).toBe(400)
    expect(m.rpcs).toHaveLength(0)
  })

  it('PT409 es 409 y el lector sigue en 403', async () => {
    expect((await manejarEdicionAnalisis(pedido({ version: 1, estructurado: modelo }), ID, entorno, mundo({ ...estructurada, rpc: () => json({ message: 'x' }, 409) }).f)).status).toBe(409)
    expect((await manejarEdicionAnalisis(pedido({ version: 1, estructurado: modelo }), ID, entorno, mundo({ ...estructurada, rol: 'lector' }).f)).status).toBe(403)
  })

  it('un análisis estructurado no se edita con texto, ni uno de texto con estructura', async () => {
    const a = mundo(estructurada)
    expect((await manejarEdicionAnalisis(pedido({ version: 1, contenido: 'texto' }), ID, entorno, a.f)).status).toBe(400)
    const b = mundo()
    expect((await manejarEdicionAnalisis(pedido({ version: 1, estructurado: modelo }), ID, entorno, b.f)).status).toBe(400)
    expect(a.rpcs.length + b.rpcs.length).toBe(0)
  })

  it('un análisis de texto viejo se sigue editando como texto', async () => {
    const m = mundo()
    expect((await manejarEdicionAnalisis(pedido({ version: 1, contenido: 'Texto corregido' }), ID, entorno, m.f)).status).toBe(200)
  })
})
