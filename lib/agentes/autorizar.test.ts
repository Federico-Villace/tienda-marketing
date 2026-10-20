import { describe, it, expect, vi } from 'vitest'
import { autorizarAgente, autorizarMiembro, MODELO_POR_DEFECTO } from './autorizar'
import { HEADER_USUARIO } from '../auth/acceso'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'

const KEY = 'sk-test-SECRETISIMA-1234'
const entorno = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_xyz',
  OPENAI_API_KEY: KEY,
}
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const pedido = (usuario: string | null = 'u-1') =>
  new Request('https://app.ejemplo.com/api/x', {
    method: 'POST',
    headers: usuario ? { [HEADER_USUARIO]: usuario } : {},
  })
const mundo = (rol: string | null = 'director') =>
  vi.fn<typeof fetch>(async () => json(rol === null ? [] : [{ rol }]))

const texto = async (r: Response) => JSON.stringify(await r.json())

describe('autorizarAgente', () => {
  it('sin x-usuario-id responde 401 y no toca nada', async () => {
    const f = mundo()
    const r = await autorizarAgente(pedido(null), entorno, 'MODELO_ANALISTA', 'pedir análisis', f)
    expect((r as Response).status).toBe(401)
    expect(f).not.toHaveBeenCalled()
  })

  it('un lector recibe 403; sin membresía también', async () => {
    for (const rol of ['lector', null]) {
      const r = await autorizarAgente(pedido(), entorno, 'MODELO_ANALISTA', 'pedir análisis', mundo(rol))
      expect((r as Response).status).toBe(403)
    }
  })

  it.each(['director', 'operador'])('%s obtiene usuario, supabase, modelo y clave', async (rol) => {
    const r = await autorizarAgente(pedido('u-9'), entorno, 'MODELO_ANALISTA', 'pedir análisis', mundo(rol))
    expect(r).toEqual({
      usuarioId: 'u-9',
      supabase: { url: 'https://abc.supabase.co', secretKey: 'sb_secret_xyz' },
      apiKey: KEY,
      modelo: MODELO_POR_DEFECTO,
      rol,
    })
  })

  it('consulta el rol del usuario en la organización piloto', async () => {
    const f = mundo()
    await autorizarAgente(pedido('u-77'), entorno, 'MODELO_ANALISTA', 'x', f)
    const url = new URL(String(f.mock.calls[0]![0]))
    expect(url.pathname).toBe('/rest/v1/miembros')
    expect(url.searchParams.get('usuario_id')).toBe('eq.u-77')
    expect(url.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
  })

  it('usa la variable de modelo que le pasan', async () => {
    const r = await autorizarAgente(pedido(), { ...entorno, MODELO_ESTRATEGA: 'gpt-5.6-luna' }, 'MODELO_ESTRATEGA', 'x', mundo())
    expect(r).toMatchObject({ modelo: 'gpt-5.6-luna' })
  })

  it('sin variables de Supabase responde 500 sin llamar', async () => {
    const f = mundo()
    const { SUPABASE_SECRET_KEY: _, ...sin } = entorno
    expect(((await autorizarAgente(pedido(), sin, 'MODELO_ANALISTA', 'x', f)) as Response).status).toBe(500)
    expect(f).not.toHaveBeenCalled()
  })

  it('sin OPENAI_API_KEY responde 503 sin filtrar nada', async () => {
    const { OPENAI_API_KEY: _, ...sin } = entorno
    const r = (await autorizarAgente(pedido(), sin, 'MODELO_ANALISTA', 'x', mundo())) as Response
    expect(r.status).toBe(503)
  })

  it('un modelo sin precio responde 500 sin la clave en el cuerpo', async () => {
    const f = mundo()
    const r = (await autorizarAgente(pedido(), { ...entorno, MODELO_ANALISTA: 'inventado' }, 'MODELO_ANALISTA', 'x', f)) as Response
    expect(r.status).toBe(500)
    expect(await texto(r)).not.toContain(KEY)
  })

  it('si Supabase falla responde 500 sin filtrar', async () => {
    const f = vi.fn<typeof fetch>(async () => json({ message: `boom ${KEY}` }, 500))
    const r = (await autorizarAgente(pedido(), entorno, 'MODELO_ANALISTA', 'x', f)) as Response
    expect(r.status).toBe(500)
    expect(await texto(r)).not.toContain(KEY)
  })
})

describe('autorizarMiembro', () => {
  it('no exige OPENAI_API_KEY y devuelve el rol', async () => {
    const { OPENAI_API_KEY: _, ...sin } = entorno
    expect(await autorizarMiembro(pedido(), sin, 'cambiar planes', mundo('operador'))).toMatchObject({ usuarioId: 'u-1', rol: 'operador' })
  })

  it('401 sin sesión y 403 para el lector', async () => {
    expect(((await autorizarMiembro(pedido(null), entorno, 'x', mundo())) as Response).status).toBe(401)
    expect(((await autorizarMiembro(pedido(), entorno, 'x', mundo('lector'))) as Response).status).toBe(403)
  })
})
