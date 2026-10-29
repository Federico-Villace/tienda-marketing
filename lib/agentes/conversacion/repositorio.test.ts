import { describe, it, expect, vi } from 'vitest'
import { abrirTurno, cerrarTurno, fallarTurno, ErrorTurno } from './repositorio.ts'

const s = { url: 'https://x.supabase.co', secretKey: 'sb_secret_x' }
const ok = (cuerpo: unknown) => vi.fn(async () => new Response(JSON.stringify(cuerpo), { status: 200 }))
const falla = (status: number) => vi.fn(async () => new Response(JSON.stringify({ message: 'boom' }), { status }))

const args = {
  org: 'o1', objeto: 'promocion' as const, objetoId: 'p1', pedido: 'más corto', usuarioId: 'u1',
  estimadoUsd: 0.001, topes: { maxTurnos: 30, topeUsdItem: 0.05, topeUsdDiario: 0.5 },
}

describe('abrirTurno', () => {
  it('llama a la rpc con los argumentos exactos', async () => {
    const f = ok({ conversacionId: 'c1', turnoId: 't1', turno: 1 })
    const r = await abrirTurno(s, args, f)
    expect(r).toEqual({ conversacionId: 'c1', turnoId: 't1', turno: 1 })
    const [url, init] = f.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.pathname).toBe('/rest/v1/rpc/abrir_turno')
    expect(JSON.parse(init.body as string)).toEqual({
      p_org: 'o1', p_objeto: 'promocion', p_objeto_id: 'p1', p_pedido: 'más corto', p_usuario: 'u1',
      p_estimado: 0.001, p_max_turnos: 30, p_tope: 0.05, p_tope_diario: 0.5,
    })
  })

  it.each([
    [409, 'Ya hay un pedido en curso'],
    [404, 'No se encontró lo que querés cambiar'],
  ])('PT%s se traduce a %s', async (status, mensaje) => {
    await expect(abrirTurno(s, args, falla(status))).rejects.toMatchObject({ status, mensaje: expect.stringContaining(mensaje) })
  })

  it('PT429 es 429 con el mensaje del tope', async () => {
    const e = await abrirTurno(s, args, falla(429)).catch((x) => x)
    expect(e).toBeInstanceOf(ErrorTurno)
    expect(e.status).toBe(429)
    expect(e.mensaje).toMatch(/tope/i)
  })

  it('otros errores se propagan', async () => {
    await expect(abrirTurno(s, args, falla(500))).rejects.not.toBeInstanceOf(ErrorTurno)
  })
})

describe('cerrar y fallar', () => {
  it('cerrar_turno manda respuesta, modelo, versión, tokens y costo', async () => {
    const f = ok({ turnoId: 't1' })
    await cerrarTurno(s, { turnoId: 't1', respuesta: { a: 1 }, modelo: 'm', version: 'v1', tokens: { entrada: 1, salida: 2, cacheados: 0, razonamiento: 0 }, costoUsd: 0.002 }, f)
    const [url, init] = f.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.pathname).toBe('/rest/v1/rpc/cerrar_turno')
    expect(JSON.parse(init.body as string)).toEqual({
      p_turno: 't1', p_respuesta: { a: 1 }, p_modelo: 'm', p_version: 'v1',
      p_tokens: { entrada: 1, salida: 2, cacheados: 0, razonamiento: 0 }, p_costo: 0.002,
    })
  })

  it('fallar_turno manda el error y el costo', async () => {
    const f = ok(null)
    await fallarTurno(s, { turnoId: 't1', error: 'x', costoUsd: 0.003 }, f)
    const [url, init] = f.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.pathname).toBe('/rest/v1/rpc/fallar_turno')
    expect(JSON.parse(init.body as string)).toMatchObject({ p_turno: 't1', p_error: 'x', p_costo: 0.003 })
  })
})
