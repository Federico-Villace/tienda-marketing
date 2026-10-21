import { describe, it, expect, vi } from 'vitest'
import { leerRol, puedeEditar } from './pantalla'

describe('puedeEditar', () => {
  it('director y operador sí; lector y null no', () => {
    expect(puedeEditar('director')).toBe(true)
    expect(puedeEditar('operador')).toBe(true)
    expect(puedeEditar('lector')).toBe(false)
    expect(puedeEditar(null)).toBe(false)
  })
})

describe('leerRol', () => {
  it('consulta miembros y devuelve el rol', async () => {
    const f = vi.fn<typeof fetch>(async () => Response.json([{ rol: 'operador' }]))
    expect(await leerRol({ url: 'https://x.supabase.co', secretKey: 'k' }, 'u-1', f)).toBe('operador')
    expect(String(f.mock.calls[0]![0])).toContain('/rest/v1/miembros')
  })
  it('sin usuario no consulta', async () => {
    const f = vi.fn<typeof fetch>()
    expect(await leerRol({ url: 'https://x.supabase.co', secretKey: 'k' }, null, f)).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })
})
