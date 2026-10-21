import { describe, it, expect, vi } from 'vitest'
import { HEADER_USUARIO } from '../auth/acceso'
import { autorizarProductor, leerTope } from './autorizar'

const CLAVE = 'AIza-SECRETISIMA-1234'
const entorno = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_xyz',
  GEMINI_API_KEY: CLAVE,
  PRESUPUESTO_MENSUAL_USD: '10',
}
const pedido = (usuario: string | null = 'u-1') =>
  new Request('https://app.ejemplo.com/api/generaciones', { method: 'POST', headers: usuario ? { [HEADER_USUARIO]: usuario } : {} })
const mundo = (rol: string | null = 'director') =>
  vi.fn<typeof fetch>(async () => Response.json(rol === null ? [] : [{ rol }]))
const texto = async (r: unknown) => JSON.stringify(await (r as Response).clone().json())

describe('leerTope (S6.4)', () => {
  it('acepta un número positivo', () => {
    expect(leerTope('10')).toBe(10)
    expect(leerTope(' 0.5 ')).toBe(0.5)
  })
  it.each([undefined, '', '  ', 'abc', '0', '-3', 'NaN', 'Infinity', '10usd'])('%s es inválido', (v) => {
    expect(leerTope(v)).toBeNull()
  })
})

describe('autorizarProductor', () => {
  it('S4.5 sin sesión es 401 y no toca nada', async () => {
    const f = mundo()
    const r = await autorizarProductor(pedido(null), entorno, 'estimar', f)
    expect((r as Response).status).toBe(401)
    expect(f).not.toHaveBeenCalled()
  })

  it('S4.5 un lector es 403, también sin membresía', async () => {
    for (const rol of ['lector', null]) {
      expect(((await autorizarProductor(pedido(), entorno, 'estimar', mundo(rol))) as Response).status).toBe(403)
    }
  })

  it.each(['director', 'operador'])('S4.5 %s obtiene el contexto con clave, tope y motor por defecto', async (rol) => {
    const r = await autorizarProductor(pedido('u-9'), entorno, 'estimar', mundo(rol))
    expect(r).toEqual({
      usuarioId: 'u-9',
      supabase: { url: 'https://abc.supabase.co', secretKey: 'sb_secret_xyz' },
      rol,
      apiKey: CLAVE,
      topeUsd: 10,
      motorPorDefecto: 'gemini-nano-banana-2.1',
    })
  })

  it('S4.6 sin GEMINI_API_KEY es 503 sin llamadas y no exige OPENAI_API_KEY', async () => {
    const f = mundo()
    const { GEMINI_API_KEY: _, ...sin } = entorno
    const r = (await autorizarProductor(pedido(), { ...sin, OPENAI_API_KEY: 'sk-x' }, 'estimar', f)) as Response
    expect(r.status).toBe(503)
    expect(await texto(r)).toContain('GEMINI_API_KEY')
    expect(f).not.toHaveBeenCalled()
    // y con Gemini pero sin OPENAI_API_KEY funciona
    expect(await autorizarProductor(pedido(), entorno, 'estimar', mundo())).toMatchObject({ apiKey: CLAVE })
  })

  it.each([undefined, '', 'abc', '0', '-1'])('S4.6/S6.4 PRESUPUESTO_MENSUAL_USD=%s apaga el Productor (503) sin llamadas', async (v) => {
    const f = mundo()
    const r = (await autorizarProductor(pedido(), { ...entorno, PRESUPUESTO_MENSUAL_USD: v }, 'estimar', f)) as Response
    expect(r.status).toBe(503)
    expect(await texto(r)).toContain('PRESUPUESTO_MENSUAL_USD')
    expect(f).not.toHaveBeenCalled()
  })

  it('sin variables de Supabase es 500', async () => {
    const { SUPABASE_SECRET_KEY: _, ...sin } = entorno
    expect(((await autorizarProductor(pedido(), sin, 'estimar', mundo())) as Response).status).toBe(500)
  })

  it('MODELO_IMAGEN sin precio es 500 sin llamadas, y uno válido se usa', async () => {
    const f = mundo()
    const r = (await autorizarProductor(pedido(), { ...entorno, MODELO_IMAGEN: 'imagen-4.0-generate' }, 'estimar', f)) as Response
    expect(r.status).toBe(500)
    expect(f).not.toHaveBeenCalled()
    const ok = await autorizarProductor(pedido(), { ...entorno, MODELO_IMAGEN: 'gemini-3-pro-image' }, 'estimar', mundo())
    expect(ok).toMatchObject({ motorPorDefecto: 'gemini-3-pro-image' })
  })

  it('ninguna respuesta de error lleva la clave', async () => {
    const respuestas = [
      await autorizarProductor(pedido(null), entorno, 'x', mundo()),
      await autorizarProductor(pedido(), entorno, 'x', mundo('lector')),
      await autorizarProductor(pedido(), { ...entorno, PRESUPUESTO_MENSUAL_USD: '' }, 'x', mundo()),
    ]
    for (const r of respuestas) expect(await texto(r)).not.toContain(CLAVE)
  })
})
