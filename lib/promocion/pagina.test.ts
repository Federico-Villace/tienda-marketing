import { describe, it, expect, vi } from 'vitest'
import { leerContextoPagina } from './pagina'
import { HEADER_USUARIO } from '../auth/acceso'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const env = (o: Record<string, string | undefined> = {}) => ({ NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_xyz', OPENAI_API_KEY: 'sk-x', ...o })
const rol = (r: string | null) => vi.fn<typeof fetch>(async () => json(r ? [{ rol: r }] : []))

describe('leerContextoPagina', () => {
  it('sin variables de Supabase devuelve un error legible, sin romper', async () => {
    const c = await leerContextoPagina(env({ NEXT_PUBLIC_SUPABASE_URL: '' }), 'u-1', rol('director'))
    expect(c.tipo).toBe('error')
    if (c.tipo === 'error') expect(c.mensaje).toMatch(/NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SECRET_KEY/)
  })

  it('director y operador pueden actuar; lector solo mira; sin membresía tampoco', async () => {
    for (const [r, puede] of [['director', true], ['operador', true], ['lector', false], [null, false]] as const) {
      const c = await leerContextoPagina(env(), 'u-1', rol(r))
      expect(c.tipo === 'ok' && c.puedeEditar, String(r)).toBe(puede)
    }
  })

  it('consulta el rol del usuario que verificó el proxy, en la organización piloto', async () => {
    const f = rol('director')
    await leerContextoPagina(env(), 'u-7', f)
    const url = new URL(String(f.mock.calls[0]![0]))
    expect(url.searchParams.get('usuario_id')).toBe('eq.u-7')
    expect(url.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
    expect(HEADER_USUARIO).toBeTruthy()
  })

  it('los agentes de texto dependen de OPENAI_API_KEY: el booleano, nunca la clave', async () => {
    const con = await leerContextoPagina(env(), 'u-1', rol('director'))
    const sin = await leerContextoPagina(env({ OPENAI_API_KEY: '' }), 'u-1', rol('director'))
    expect(con.tipo === 'ok' && con.openai).toBe(true)
    expect(sin.tipo === 'ok' && sin.openai).toBe(false)
    expect(JSON.stringify(con)).not.toContain('sk-x')
  })

  it('dice cuánto cuesta cada paso con el modelo configurado', async () => {
    const c = await leerContextoPagina(env(), 'u-1', rol('director'))
    if (c.tipo !== 'ok') throw new Error('debería estar ok')
    expect(c.costoAntecedentes).toMatch(/^~US\$ 0,00\d$/)
    expect(c.costoTextos).toMatch(/^~US\$ 0,00\d$/)
  })

  it('un modelo sin precio no inventa un costo: el botón queda sin cifra', async () => {
    const c = await leerContextoPagina(env({ MODELO_ANALISTA: 'modelo-raro' }), 'u-1', rol('director'))
    expect(c.tipo === 'ok' && c.costoAntecedentes).toBe('')
  })

  it('un fallo de la base al leer el rol es un error legible', async () => {
    const c = await leerContextoPagina(env(), 'u-1', vi.fn(async () => json({ message: 'boom' }, 500)))
    expect(c.tipo).toBe('error')
  })
})
