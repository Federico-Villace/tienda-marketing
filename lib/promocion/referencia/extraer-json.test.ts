import { describe, it, expect } from 'vitest'
import { extraerJson } from './extraer-json'

describe('extraerJson: el texto del modelo es entrada no confiable', () => {
  it('un JSON limpio', () => {
    expect(extraerJson('{"a":1}')).toEqual({ a: 1 })
    expect(extraerJson('  \n{"a":[1,2]}\n ')).toEqual({ a: [1, 2] })
  })

  it('envuelto en comillas de código, con o sin "json"', () => {
    expect(extraerJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extraerJson('```\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('con texto antes o después', () => {
    expect(extraerJson('Listo, acá está: {"a":{"b":2}} ¿algo más?')).toEqual({ a: { b: 2 } })
  })

  it('una llave dentro de un string no corta el objeto', () => {
    expect(extraerJson('{"a":"}{"}')).toEqual({ a: '}{' })
  })

  it('devuelve null si no hay un objeto: vacío, basura, array, número, truncado', () => {
    for (const t of ['', '   ', 'hola', '[1,2]', '42', '"x"', '{"a":', '{{', 'null']) expect(extraerJson(t), t).toBeNull()
  })

  it('no ejecuta ni evalúa nada: proto y constructor quedan como datos', () => {
    const r = extraerJson('{"__proto__":{"x":1},"constructor":2}') as Record<string, unknown>
    expect(({} as Record<string, unknown>).x).toBeUndefined()
    expect(r).not.toBeNull()
  })

  it('un texto enorme se rechaza sin colgarse', () => {
    expect(extraerJson('{"a":"' + 'x'.repeat(200_000) + '"}')).toBeNull()
  })
})
