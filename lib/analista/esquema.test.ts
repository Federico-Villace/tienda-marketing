import { describe, expect, it } from 'vitest'
import { ESQUEMA_ANALISIS_V4, FORMATO_ANALISTA, FORMATO_RESPALDO } from './esquema'

/** Recorre el schema y verifica las reglas de strict en cada objeto. */
function objetos(x: unknown, salida: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(x)) x.forEach((y) => objetos(y, salida))
  else if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>
    if (o.type === 'object') salida.push(o)
    Object.values(o).forEach((y) => objetos(y, salida))
  }
  return salida
}

describe('ESQUEMA_ANALISIS_V4 (strict)', () => {
  it('todo objeto: additionalProperties false y required = todas sus claves', () => {
    const os = objetos(ESQUEMA_ANALISIS_V4)
    expect(os.length).toBeGreaterThan(2)
    for (const o of os) {
      expect(o.additionalProperties).toBe(false)
      expect(o.required).toEqual(Object.keys(o.properties as object))
    }
  })

  it('no usa keywords sin confirmar para strict', () => {
    expect(JSON.stringify(ESQUEMA_ANALISIS_V4)).not.toMatch(/minimum|maximum|minLength|maxLength|pattern|minItems|maxItems/)
  })

  it('los dos formatos: schema strict y respaldo json_object', () => {
    expect(FORMATO_ANALISTA).toMatchObject({ type: 'json_schema', strict: true, name: 'analisis_v4' })
    expect(FORMATO_RESPALDO).toEqual({ type: 'json_object' })
  })
})
