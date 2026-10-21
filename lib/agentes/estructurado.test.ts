import { describe, it, expect, vi, afterEach } from 'vitest'
import { pedirJson } from './estructurado'
import type { FormatoTexto } from './openai'

const FORMATO: FormatoTexto = { type: 'json_schema', name: 'x', strict: true, schema: { type: 'object' } }
const base = {
  apiKey: 'sk-test-SECRETISIMA',
  modelo: 'gpt-6-luna',
  entrada: 'hola',
  instrucciones: 'normal',
  respaldo: 'con schema pegado',
  formato: FORMATO,
  etiqueta: 'prueba',
}
const ok = () =>
  new Response(
    JSON.stringify({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: '{"a":1}' }] }],
      usage: { input_tokens: 10, output_tokens: 5 },
    }),
  )
const cuerpo = (f: ReturnType<typeof vi.fn>, n: number) => JSON.parse(String(f.mock.calls[n]![1]?.body))

afterEach(() => vi.restoreAllMocks())

describe('pedirJson', () => {
  it('strict aceptado: una sola llamada con el formato y las instrucciones normales', async () => {
    const f = vi.fn<typeof fetch>(async () => ok())
    const r = await pedirJson(base, f)
    expect(f).toHaveBeenCalledTimes(1)
    expect(cuerpo(f, 0).text.format).toEqual(FORMATO)
    expect(cuerpo(f, 0).instructions).toBe('normal')
    expect(r.texto).toBe('{"a":1}')
  })

  it('un 400 reintenta con json_object y las instrucciones de respaldo', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{}', { status: 400 }))
      .mockResolvedValueOnce(ok())
    const r = await pedirJson(base, f)
    expect(f).toHaveBeenCalledTimes(2)
    expect(cuerpo(f, 1).text.format).toEqual({ type: 'json_object' })
    expect(cuerpo(f, 1).instructions).toBe('con schema pegado')
    expect(r.uso.entrada).toBe(10)
  })

  it('otro error se propaga sin reintentar', async () => {
    const f = vi.fn<typeof fetch>(async () => new Response('{}', { status: 500 }))
    await expect(pedirJson(base, f)).rejects.toMatchObject({ tipo: 'http', status: 500 })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('pasa maxTokensSalida', async () => {
    const f = vi.fn<typeof fetch>(async () => ok())
    await pedirJson({ ...base, maxTokensSalida: 8000 }, f)
    expect(cuerpo(f, 0).max_output_tokens).toBe(8000)
  })
})
