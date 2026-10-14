import { describe, it, expect, vi } from 'vitest'
import { darDeAlta } from './alta'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'

const base = { url: 'https://abc.supabase.co', secretKey: 'sb_secret_xyz', email: 'Julian@999motos.com.ar', rol: 'director' as const }
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })

function supabase({ existe = false } = {}) {
  const miembros: unknown[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    if (url.pathname === '/auth/v1/admin/users' && init?.method === 'POST') {
      return existe ? json({ error_code: 'email_exists' }, 422) : json({ id: 'u-nuevo', email: 'julian@999motos.com.ar' })
    }
    if (url.pathname === '/auth/v1/admin/users') {
      return json({ users: [{ id: 'u-viejo', email: 'julian@999motos.com.ar' }] })
    }
    if (url.pathname === '/rest/v1/miembros') {
      miembros.push(...JSON.parse(String(init?.body)))
      return json(miembros, 201)
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, miembros }
}

describe('darDeAlta', () => {
  it('crea el usuario con una clave generada y lo hace miembro de la organización', async () => {
    const { f, miembros } = supabase()
    const r = await darDeAlta(base, f, () => 'clave-generada')

    expect(r).toEqual({ usuario: { id: 'u-nuevo', email: 'julian@999motos.com.ar' }, clave: 'clave-generada' })
    expect(miembros).toEqual([{ organizacion_id: ORGANIZACION_PILOTO_ID, usuario_id: 'u-nuevo', rol: 'director' }])
    const alta = f.mock.calls.find(([, i]) => i?.method === 'POST' && String(f.mock.calls[0]![0]).includes('admin'))!
    expect(JSON.parse(String(alta[1]?.body)).email).toBe('julian@999motos.com.ar')
  })

  it('si el usuario ya existe, solo lo suma como miembro y no toca su clave', async () => {
    const { f, miembros } = supabase({ existe: true })
    const r = await darDeAlta(base, f, () => 'no-se-usa')
    expect(r).toEqual({ usuario: { id: 'u-viejo', email: 'julian@999motos.com.ar' }, clave: null })
    expect(miembros).toEqual([{ organizacion_id: ORGANIZACION_PILOTO_ID, usuario_id: 'u-viejo', rol: 'director' }])
  })

  it('la membresía es upsert: correrlo dos veces no duplica', async () => {
    const { f } = supabase()
    await darDeAlta(base, f, () => 'c')
    const [u, init] = f.mock.calls.find(([x]) => String(x).includes('/rest/v1/miembros'))!
    expect(new URL(String(u)).searchParams.get('on_conflict')).toBe('organizacion_id,usuario_id')
    expect(new Headers(init?.headers).get('prefer')).toContain('merge-duplicates')
  })
})
