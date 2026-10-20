import { describe, it, expect, vi } from 'vitest'
import { manejarActualizar, MINUTOS_ENFRIAMIENTO, MINUTOS_CORRIDA_VIVA } from './actualizar'
import { HEADER_USUARIO } from '../auth/acceso'

const entorno = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_xyz',
  META_API_VERSION: 'v26.0',
}
const AHORA = new Date('2026-10-23T15:00:00Z')
const haceMin = (m: number) => new Date(AHORA.getTime() - m * 60_000).toISOString()

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })

const pedido = (usuario: string | null = 'u-1') =>
  new Request('https://app.ejemplo.com/api/actualizar', {
    method: 'POST',
    headers: usuario ? { [HEADER_USUARIO]: usuario } : {},
  })

type Corrida = { tipo: string; estado: string; iniciada_en: string }
type Mundo = { rol?: string | null; corridas?: Corrida[]; token?: string | null }

/** Supabase falso: miembros, sincronizaciones previas y Vault. Registra los GET de sincronizaciones. */
function mundo({ rol = 'director', corridas = [], token = 'TOKEN-VAULT' }: Mundo = {}) {
  const consultas: URL[] = []
  const f = vi.fn<typeof fetch>(async (u) => {
    const url = new URL(String(u))
    if (url.pathname.endsWith('/rest/v1/miembros')) return json(rol ? [{ rol }] : [])
    if (url.pathname.endsWith('/rest/v1/sincronizaciones')) {
      consultas.push(url)
      return json(corridas)
    }
    if (url.pathname.endsWith('/rpc/leer_token_meta')) return json(token)
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, consultas }
}

const sincronizadores = () => ({
  publicidad: vi.fn(async () => ({ estado: 'ok' as const, filas: 40, cuentas: [{ cuenta: 'a', nombre: 'A', campanias: 1, metricas: 1 }] })),
  organico: vi.fn(async () => ({ estado: 'ok' as const, filas: 12, cuentas: [{ cuenta: 'p', nombre: 'P', red: 'facebook' as const, publicaciones: 1, metricas: 1 }] })),
})

describe('manejarActualizar · acceso', () => {
  it('sin sesión (sin x-usuario-id) responde 401 y no sincroniza', async () => {
    const s = sincronizadores()
    const r = await manejarActualizar(pedido(null), entorno, mundo().f, s, AHORA)
    expect(r.status).toBe(401)
    expect(s.publicidad).not.toHaveBeenCalled()
  })

  it('un lector recibe 403 y no sincroniza', async () => {
    const s = sincronizadores()
    const r = await manejarActualizar(pedido(), entorno, mundo({ rol: 'lector' }).f, s, AHORA)
    expect(r.status).toBe(403)
    expect(s.publicidad).not.toHaveBeenCalled()
    expect(s.organico).not.toHaveBeenCalled()
  })

  it.each(['director', 'operador'])('un %s puede actualizar', async (rol) => {
    const r = await manejarActualizar(pedido(), entorno, mundo({ rol }).f, sincronizadores(), AHORA)
    expect(r.status).toBe(200)
  })
})

describe('manejarActualizar · límite de uso', () => {
  it('con una corrida en curso (< 10 min) responde 409', async () => {
    const s = sincronizadores()
    const m = mundo({ corridas: [{ tipo: 'campanias', estado: 'corriendo', iniciada_en: haceMin(2) }] })
    const r = await manejarActualizar(pedido(), entorno, m.f, s, AHORA)
    expect(r.status).toBe(409)
    expect((await r.json()).error).toBe('Ya hay una actualización en curso')
    expect(s.publicidad).not.toHaveBeenCalled()
  })

  it('una corrida "corriendo" vieja (> 10 min) no bloquea para siempre', async () => {
    const s = sincronizadores()
    const m = mundo({ corridas: [{ tipo: 'publicaciones', estado: 'corriendo', iniciada_en: haceMin(MINUTOS_CORRIDA_VIVA + 1) }] })
    const r = await manejarActualizar(pedido(), entorno, m.f, s, AHORA)
    expect(r.status).toBe(200)
    expect(s.publicidad).toHaveBeenCalledTimes(1)
  })

  it('con una corrida terminada hace 5 min responde 429 con minutos restantes y Retry-After', async () => {
    const s = sincronizadores()
    const m = mundo({ corridas: [{ tipo: 'campanias', estado: 'ok', iniciada_en: haceMin(5) }] })
    const r = await manejarActualizar(pedido(), entorno, m.f, s, AHORA)
    expect(r.status).toBe(429)
    expect((await r.json()).error).toBe('Probá de nuevo en 10 minutos')
    expect(r.headers.get('retry-after')).toBe(String(10 * 60))
    expect(s.publicidad).not.toHaveBeenCalled()
  })

  it('cuenta también las corridas con error o parcial, y usa la más reciente de cualquier tipo', async () => {
    const m = mundo({
      corridas: [
        { tipo: 'campanias', estado: 'error', iniciada_en: haceMin(14) },
        { tipo: 'publicaciones', estado: 'parcial', iniciada_en: haceMin(13.5) },
      ],
    })
    const r = await manejarActualizar(pedido(), entorno, m.f, sincronizadores(), AHORA)
    expect(r.status).toBe(429)
    expect((await r.json()).error).toBe('Probá de nuevo en 2 minutos')
  })

  it('pasada la ventana de enfriamiento, corre', async () => {
    const m = mundo({ corridas: [{ tipo: 'campanias', estado: 'ok', iniciada_en: haceMin(MINUTOS_ENFRIAMIENTO + 1) }] })
    const r = await manejarActualizar(pedido(), entorno, m.f, sincronizadores(), AHORA)
    expect(r.status).toBe(200)
  })

  it('consulta solo las corridas de ambos tipos dentro de la ventana, de la organización piloto', async () => {
    const m = mundo()
    await manejarActualizar(pedido(), entorno, m.f, sincronizadores(), AHORA)
    const q = m.consultas[0]!
    expect(q.searchParams.get('tipo')).toBe('in.(campanias,publicaciones)')
    expect(q.searchParams.get('iniciada_en')).toBe(`gte.${haceMin(MINUTOS_ENFRIAMIENTO)}`)
    expect(q.searchParams.get('organizacion_id')).toMatch(/^eq\./)
  })
})

describe('manejarActualizar · ejecución', () => {
  it('corre publicidad y después orgánico con el token de Vault y devuelve estado, filas y resumen', async () => {
    const orden: string[] = []
    const s = {
      publicidad: vi.fn(async (d: { meta: { token: string; version: string } }) => {
        orden.push(`publicidad:${d.meta.token}:${d.meta.version}`)
        return { estado: 'ok' as const, filas: 40, cuentas: [{ cuenta: 'a', nombre: 'A', campanias: 1, metricas: 1 }] }
      }),
      organico: vi.fn(async () => {
        orden.push('organico')
        return { estado: 'ok' as const, filas: 12, cuentas: [{ cuenta: 'p', nombre: 'P', red: 'facebook' as const, publicaciones: 1, metricas: 1 }] }
      }),
    }
    const r = await manejarActualizar(pedido(), entorno, mundo().f, s, AHORA)
    expect(orden).toEqual(['publicidad:TOKEN-VAULT:v26.0', 'organico'])
    const cuerpo = await r.json()
    expect(cuerpo.publicidad).toMatchObject({ estado: 'ok', filas: 40 })
    expect(cuerpo.organico).toMatchObject({ estado: 'ok', filas: 12 })
    expect(cuerpo.publicidad.resumen).toEqual(expect.any(String))
    expect(cuerpo.organico.resumen).toEqual(expect.any(String))
  })

  it('si publicidad falla (lanza), igual corre orgánico y el error sale sin el token', async () => {
    const s = sincronizadores()
    s.publicidad.mockRejectedValueOnce(new Error('boom con TOKEN-VAULT adentro'))
    const r = await manejarActualizar(pedido(), entorno, mundo().f, s, AHORA)
    expect(s.organico).toHaveBeenCalledTimes(1)
    const texto = await r.text()
    expect(texto).not.toContain('TOKEN-VAULT')
    expect(JSON.parse(texto).publicidad.estado).toBe('error')
    expect(r.status).toBe(200)
  })

  it('si las dos fallan responde 502', async () => {
    const s = {
      publicidad: vi.fn(async () => ({ estado: 'error' as const, filas: 0, cuentas: [], error: '(#190) x' })),
      organico: vi.fn(async () => ({ estado: 'error' as const, filas: 0, cuentas: [], error: '(#190) y' })),
    }
    const r = await manejarActualizar(pedido(), entorno, mundo().f, s, AHORA)
    expect(r.status).toBe(502)
  })

  it('un resultado parcial se informa tal cual (200)', async () => {
    const s = sincronizadores()
    s.organico.mockResolvedValueOnce({
      estado: 'parcial' as never,
      filas: 3,
      cuentas: [
        { cuenta: 'p', nombre: 'P', red: 'facebook', publicaciones: 1, metricas: 1, error: 'x' },
        { cuenta: 'q', nombre: 'Q', red: 'facebook', publicaciones: 1, metricas: 1 },
      ],
      error: 'p: x',
    } as never)
    const r = await manejarActualizar(pedido(), entorno, mundo().f, s, AHORA)
    expect(r.status).toBe(200)
    expect((await r.json()).organico.estado).toBe('parcial')
  })

  it('sin token en Vault responde 503 y no sincroniza', async () => {
    const s = sincronizadores()
    const r = await manejarActualizar(pedido(), entorno, mundo({ token: null }).f, s, AHORA)
    expect(r.status).toBe(503)
    expect(s.publicidad).not.toHaveBeenCalled()
  })
})
