import { describe, it, expect, vi, afterEach } from 'vitest'
import { ErrorOpenAI, pedirRespuesta } from './openai'

const KEY = 'sk-test-SECRETISIMA-1234'
const params = { apiKey: KEY, modelo: 'gpt-6-luna', instrucciones: 'sé breve', entrada: '{"a":1}' }

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })

const ok = (o: Record<string, unknown> = {}) => ({
  status: 'completed',
  output: [
    { type: 'reasoning', summary: [] },
    { type: 'message', content: [{ type: 'output_text', text: 'Hola ' }, { type: 'output_text', text: 'mundo' }] },
  ],
  usage: {
    input_tokens: 3000,
    input_tokens_details: { cached_tokens: 200, cache_write_tokens: 100 },
    output_tokens: 900,
    output_tokens_details: { reasoning_tokens: 400 },
  },
  ...o,
})

afterEach(() => vi.useRealTimers())

describe('pedirRespuesta', () => {
  it('hace POST a la Responses API con el body y los headers del diseño', async () => {
    const f = vi.fn<typeof fetch>(async () => json(ok()))
    await pedirRespuesta(params, f)

    const [url, init] = f.mock.calls[0]!
    expect(String(url)).toBe('https://api.openai.com/v1/responses')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${KEY}`)
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'gpt-6-luna',
      instructions: 'sé breve',
      input: '{"a":1}',
      reasoning: { effort: 'low' },
      max_output_tokens: 6000,
      store: false,
      prompt_cache_options: { mode: 'explicit' },
    })
  })

  it('maxTokensSalida sobreescribe el tope de 6000 del body', async () => {
    const f = vi.fn<typeof fetch>(async () => json(ok()))
    await pedirRespuesta({ ...params, maxTokensSalida: 3000 }, f)
    expect(JSON.parse(String(f.mock.calls[0]![1]?.body)).max_output_tokens).toBe(3000)
  })

  it('extrae el texto solo del item message (ignora el reasoning) y concatena los output_text', async () => {
    const r = await pedirRespuesta(params, async () => json(ok()))
    expect(r.texto).toBe('Hola mundo')
  })

  it('extrae el uso: entrada, cacheadas, escritura de cache, salida y razonamiento', async () => {
    const r = await pedirRespuesta(params, async () => json(ok()))
    expect(r.uso).toEqual({ entrada: 3000, cacheadas: 200, escrituraCache: 100, salida: 900, razonamiento: 400 })
  })

  it('si el uso no trae los detalles, los toma como 0', async () => {
    const r = await pedirRespuesta(params, async () =>
      json(ok({ usage: { input_tokens: 10, output_tokens: 5 } })),
    )
    expect(r.uso).toEqual({ entrada: 10, cacheadas: 0, escrituraCache: 0, salida: 5, razonamiento: 0 })
  })

  it('status incomplete es un error (nada para guardar), con el motivo en español', async () => {
    const f = async () => json(ok({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }))
    const e = await pedirRespuesta(params, f).catch((x) => x)
    expect(e).toBeInstanceOf(ErrorOpenAI)
    expect(e.tipo).toBe('incompleto')
    expect(e.message).toMatch(/incompleta/i)
  })

  it('respuesta sin texto es un error', async () => {
    const e = await pedirRespuesta(params, async () => json(ok({ output: [{ type: 'reasoning' }] }))).catch((x) => x)
    expect(e).toBeInstanceOf(ErrorOpenAI)
    expect(e.tipo).toBe('vacio')
  })

  it('un texto de solo espacios cuenta como vacío', async () => {
    const out = [{ type: 'message', content: [{ type: 'output_text', text: '   ' }] }]
    const e = await pedirRespuesta(params, async () => json(ok({ output: out }))).catch((x) => x)
    expect(e.tipo).toBe('vacio')
  })

  it.each([
    [401, /clave/i],
    [429, /límite|demasiad/i],
    [500, /OpenAI/],
  ])('HTTP %i es ErrorOpenAI con mensaje en español y SIN la clave', async (status, patron) => {
    // OpenAI suele devolver un pedazo de la clave en el mensaje de 401.
    const f = async () => json({ error: { message: `Incorrect API key provided: ${KEY}` } }, status)
    const e = await pedirRespuesta(params, f).catch((x) => x)
    expect(e).toBeInstanceOf(ErrorOpenAI)
    expect(e.tipo).toBe('http')
    expect(e.status).toBe(status)
    expect(e.message).toMatch(patron)
    expect(e.message).not.toContain(KEY)
    expect(JSON.stringify({ ...e, message: e.message, stack: e.stack })).not.toContain(KEY)
  })

  it('si fetch falla (red), ErrorOpenAI sin la clave', async () => {
    const f = async () => {
      throw new TypeError(`fetch failed (Authorization: Bearer ${KEY})`)
    }
    const e = await pedirRespuesta(params, f).catch((x) => x)
    expect(e).toBeInstanceOf(ErrorOpenAI)
    expect(e.tipo).toBe('red')
    expect(e.message).not.toContain(KEY)
  })

  it('aborta a los 90 s y devuelve un error de timeout', async () => {
    vi.useFakeTimers()
    // Un fetch que no resuelve nunca, pero respeta el signal.
    const f = vi.fn<typeof fetch>(
      (_u, init) =>
        new Promise((_res, rej) => {
          init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
        }),
    )
    const p = pedirRespuesta(params, f).catch((x) => x)
    await vi.advanceTimersByTimeAsync(89_000)
    expect(f.mock.calls[0]![1]?.signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1_500)
    const e = await p
    expect(e).toBeInstanceOf(ErrorOpenAI)
    expect(e.tipo).toBe('timeout')
    expect(e.message).toMatch(/tard/i)
  })

  it('no deja el timer vivo cuando responde a tiempo', async () => {
    vi.useFakeTimers()
    await pedirRespuesta(params, async () => json(ok()))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('sin `formato` el body no trae text (igual que antes)', async () => {
    const f = vi.fn<typeof fetch>(async () => json(ok()))
    await pedirRespuesta(params, f)
    expect(JSON.parse(String(f.mock.calls[0]![1]?.body))).not.toHaveProperty('text')
  })

  it('con `formato` json_schema el body suma text.format', async () => {
    const formato = { type: 'json_schema', name: 'x', strict: true, schema: { type: 'object' } } as const
    const f = vi.fn<typeof fetch>(async () => json(ok()))
    await pedirRespuesta({ ...params, formato }, f)
    expect(JSON.parse(String(f.mock.calls[0]![1]?.body)).text).toEqual({ format: formato })
  })

  it('un refusal del modelo es ErrorOpenAI tipo rechazo, sin repetir su texto', async () => {
    const out = [{ type: 'message', content: [{ type: 'refusal', refusal: `no puedo ${KEY}` }] }]
    const e = await pedirRespuesta(params, async () => json(ok({ output: out }))).catch((x) => x)
    expect(e).toBeInstanceOf(ErrorOpenAI)
    expect(e.tipo).toBe('rechazo')
    expect(e.message).not.toContain(KEY)
  })
})
