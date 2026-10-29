import { describe, it, expect, vi } from 'vitest'
import { ejecutarTurno } from './turno.ts'
import { ErrorOpenAI } from '../openai.ts'
import { ErrorSupabase } from '../../supabase/rest.ts'

const s = { url: 'https://x.supabase.co', secretKey: 'sb_secret_x' }
const USO = { entrada: 2500, cacheadas: 0, escrituraCache: 0, salida: 1500, razonamiento: 0 }

type Opciones = { abrir?: number; cerrar?: number }
/** Supabase falso: registra el orden de las rpc y las lecturas devuelven turnos previos. */
function entorno(o: Opciones = {}) {
  const log: string[] = []
  const cuerpos: Record<string, unknown[]> = {}
  const f = vi.fn(async (url: URL | string, init?: RequestInit) => {
    const ruta = new URL(url.toString()).pathname.replace('/rest/v1/', '')
    log.push(ruta)
    ;(cuerpos[ruta] ??= []).push(init?.body ? JSON.parse(init.body as string) : null)
    if (ruta === 'rpc/abrir_turno') {
      if (o.abrir) return new Response(JSON.stringify({ message: 'x' }), { status: o.abrir })
      return new Response(JSON.stringify({ conversacionId: 'c1', turnoId: 't1', turno: 2 }), { status: 200 })
    }
    if (ruta === 'turnos_conversacion') {
      return new Response(JSON.stringify([{ turno: 1, pedido: 'más oscuro', estado: 'ok' }]), { status: 200 })
    }
    if (ruta === 'rpc/cerrar_turno' && o.cerrar) return new Response('{"message":"x"}', { status: o.cerrar })
    return new Response('null', { status: 200 })
  })
  return { f: f as unknown as typeof fetch, log, cuerpos }
}

const base = (extra: Record<string, unknown> = {}) => ({
  s, org: 'o1', objeto: 'promocion' as const, objetoId: 'p1', usuarioId: 'u1', pedido: 'más corto',
  estimadoUsd: 0.001, topes: { maxTurnos: 30, topeUsdItem: 0.05, topeUsdDiario: 0.5 },
  modelo: 'gpt-6-luna', version: 'v1',
  llamar: vi.fn(async (_anteriores: string[]) => ({ texto: '{"ok":1}', uso: USO })),
  validar: vi.fn((t: string) => ({ ok: true as const, valor: JSON.parse(t) as { ok: number } })),
  aplicar: vi.fn(async () => 'aplicado'),
  respuesta: vi.fn(() => ({ despues: 1 })),
  ...extra,
})

describe('ejecutarTurno', () => {
  it('orden: abrir → OpenAI → validar → aplicar → cerrar, con los pedidos anteriores', async () => {
    const e = entorno()
    const p = base()
    const r = await ejecutarTurno(p, e.f)
    expect(r).toMatchObject({ ok: true, valor: 'aplicado', turno: 2 })
    expect(e.log.filter((x) => x.startsWith('rpc/'))).toEqual(['rpc/abrir_turno', 'rpc/cerrar_turno'])
    expect(p.llamar).toHaveBeenCalledWith(['más oscuro'])
    const orden = [p.llamar, p.validar, p.aplicar, p.respuesta].map((m) => m.mock.invocationCallOrder[0]!)
    expect([...orden].sort((a, b) => a - b)).toEqual(orden)
    const cierre = e.cuerpos['rpc/cerrar_turno']![0] as { p_costo: number; p_respuesta: unknown; p_modelo: string }
    expect(cierre.p_costo).toBeGreaterThan(0)
    expect(cierre.p_respuesta).toEqual({ despues: 1 })
  })

  it.each([409, 429, 404])('abrir_turno devuelve %s: CERO llamadas a OpenAI y nada se aplica', async (status) => {
    const e = entorno({ abrir: status })
    const p = base()
    const r = await ejecutarTurno(p, e.f)
    expect(r).toMatchObject({ ok: false, status })
    expect(p.llamar).not.toHaveBeenCalled()
    expect(p.aplicar).not.toHaveBeenCalled()
    expect(e.log).toEqual(['rpc/abrir_turno'])
  })

  it('error de OpenAI: fallar_turno con costo 0, 502, sin aplicar', async () => {
    const e = entorno()
    const p = base({ llamar: vi.fn(async () => { throw new ErrorOpenAI('cayó', 'red') }) })
    const r = await ejecutarTurno(p, e.f)
    expect(r).toMatchObject({ ok: false, status: 502 })
    expect(p.aplicar).not.toHaveBeenCalled()
    expect(e.cuerpos['rpc/fallar_turno']![0]).toMatchObject({ p_turno: 't1', p_costo: 0 })
  })

  it('timeout de OpenAI: 504 y se cobra el estimado (puede haber gastado)', async () => {
    const e = entorno()
    const p = base({ llamar: vi.fn(async () => { throw new ErrorOpenAI('lento', 'timeout') }) })
    const r = await ejecutarTurno(p, e.f)
    expect(r).toMatchObject({ ok: false, status: 504 })
    expect(e.cuerpos['rpc/fallar_turno']![0]).toMatchObject({ p_costo: 0.001 })
  })

  it('texto inválido: fallar_turno con el costo REAL, 502, sin aplicar', async () => {
    const e = entorno()
    const p = base({ validar: vi.fn(() => ({ ok: false as const, errores: ['mal'] })) })
    const r = await ejecutarTurno(p, e.f)
    expect(r).toMatchObject({ ok: false, status: 502 })
    expect(p.aplicar).not.toHaveBeenCalled()
    const f = e.cuerpos['rpc/fallar_turno']![0] as { p_costo: number }
    expect(f.p_costo).toBeGreaterThan(0)
    expect(e.log).not.toContain('rpc/cerrar_turno')
  })

  it('409 al aplicar: fallar con costo y 409', async () => {
    const e = entorno()
    const p = base({ aplicar: vi.fn(async () => { throw new ErrorSupabase('rev', 409) }) })
    const r = await ejecutarTurno(p, e.f)
    expect(r).toMatchObject({ ok: false, status: 409 })
    expect((e.cuerpos['rpc/fallar_turno']![0] as { p_costo: number }).p_costo).toBeGreaterThan(0)
  })

  it('error inesperado al aplicar: se falla el turno (no queda pendiente) y se propaga', async () => {
    const e = entorno()
    const p = base({ aplicar: vi.fn(async () => { throw new Error('rotó') }) })
    await expect(ejecutarTurno(p, e.f)).rejects.toThrow('rotó')
    expect(e.log).toContain('rpc/fallar_turno')
  })
})
