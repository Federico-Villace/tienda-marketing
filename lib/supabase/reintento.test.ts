import { describe, expect, it, vi } from 'vitest'
import { conReintentoPorReloj, esRelojDesfasado } from './reintento'

const resp = (cuerpo: unknown, status: number) => new Response(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), { status })
const FUTURO = { message: 'JWT issued at future' }

describe('esRelojDesfasado', () => {
  it('reconoce un 401 de reloj desfasado', () => {
    expect(esRelojDesfasado(401, JSON.stringify(FUTURO))).toBe(true)
    expect(esRelojDesfasado(401, 'Token used before issued (nbf)')).toBe(true)
    expect(esRelojDesfasado(401, '{"msg":"invalid JWT: unable to parse or verify signature, Token used before issued"}')).toBe(true)
  })
  it('un 401 común o cualquier otro status no cuenta', () => {
    expect(esRelojDesfasado(401, '{"message":"Invalid API key"}')).toBe(false)
    expect(esRelojDesfasado(403, JSON.stringify(FUTURO))).toBe(false)
    expect(esRelojDesfasado(500, JSON.stringify(FUTURO))).toBe(false)
  })
})

describe('conReintentoPorReloj', () => {
  it('si todo anda, llama una sola vez y no espera', async () => {
    const dormir = vi.fn(async () => {})
    const llamar = vi.fn(async () => resp([], 200))
    const r = await conReintentoPorReloj(llamar, { dormir })
    expect(r.status).toBe(200)
    expect(llamar).toHaveBeenCalledTimes(1)
    expect(dormir).not.toHaveBeenCalled()
  })
  it('un 401 "issued at future" se reintenta UNA vez, después de ~1 s', async () => {
    const dormir = vi.fn(async () => {})
    const llamar = vi.fn().mockResolvedValueOnce(resp(FUTURO, 401)).mockResolvedValueOnce(resp([{ id: 1 }], 200))
    const r = await conReintentoPorReloj(llamar, { dormir })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual([{ id: 1 }])
    expect(llamar).toHaveBeenCalledTimes(2)
    expect(dormir).toHaveBeenCalledWith(1000)
  })
  it('si sigue fallando, devuelve el segundo error y no insiste', async () => {
    const llamar = vi.fn(async () => resp(FUTURO, 401))
    const r = await conReintentoPorReloj(llamar, { dormir: async () => {} })
    expect(r.status).toBe(401)
    expect(await r.text()).toContain('issued at future')
    expect(llamar).toHaveBeenCalledTimes(2)
  })
  it('un 401 que no es de reloj no se reintenta (y el cuerpo sigue legible)', async () => {
    const llamar = vi.fn(async () => resp({ message: 'Invalid API key' }, 401))
    const r = await conReintentoPorReloj(llamar, { dormir: async () => {} })
    expect(llamar).toHaveBeenCalledTimes(1)
    expect(await r.json()).toEqual({ message: 'Invalid API key' })
  })
})
