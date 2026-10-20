import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from './proxy'

/**
 * Lo que importa de proxy.ts: el x-usuario-id que llega al handler es SIEMPRE
 * el verificado por el proxy, jamás uno que mande el cliente.
 */

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function entornoYAuth() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_123')
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async () => json({ id: 'u-real', email: 'j@x.com' })),
  )
}

/** Next marca los headers que reescribe el proxy con x-middleware-override-headers / x-middleware-request-*. */
const headerReenviado = (r: Response, nombre: string) => r.headers.get(`x-middleware-request-${nombre}`)
const lista = (r: Response) => (r.headers.get('x-middleware-override-headers') ?? '').split(',')

describe('proxy', () => {
  it('SEGURIDAD: con sesión válida pasa el id verificado y pisa el que mandó el cliente', async () => {
    entornoYAuth()
    const r = await proxy(
      new NextRequest('https://app.ejemplo.com/api/analisis', {
        method: 'POST',
        headers: { cookie: 'sesion_acceso=bueno', 'x-usuario-id': 'admin-falso' },
      }),
    )
    expect(headerReenviado(r, 'x-usuario-id')).toBe('u-real')
  })

  it('SEGURIDAD: en una ruta pública el x-usuario-id spoofeado se descarta', async () => {
    entornoYAuth()
    const r = await proxy(
      new NextRequest('https://app.ejemplo.com/api/sync', { headers: { 'x-usuario-id': 'admin-falso' } }),
    )
    expect(headerReenviado(r, 'x-usuario-id')).toBeNull()
    expect(lista(r)).not.toContain('x-usuario-id')
  })

  it('sin sesión responde 401 en una API y no llega al handler', async () => {
    entornoYAuth()
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => json({}, 401)))
    const r = await proxy(
      new NextRequest('https://app.ejemplo.com/api/analisis', {
        method: 'POST',
        headers: { cookie: 'sesion_acceso=malo', 'x-usuario-id': 'admin-falso' },
      }),
    )
    expect(r.status).toBe(401)
  })
})
