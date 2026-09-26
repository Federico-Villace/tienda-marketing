import { describe, it, expect } from 'vitest'
import { revisarEntorno, REQUISITOS } from './entorno'

/**
 * La app tiene que levantar SIN una sola variable configurada y decirle al
 * usuario qué le falta. Nunca explotar en el arranque por una clave ausente.
 */
describe('revisarEntorno', () => {
  const todasLasObligatorias = (): Record<string, string> =>
    Object.fromEntries(
      REQUISITOS.filter((r) => r.obligatoria).map((r) => [r.nombre, 'valor']),
    )

  it('no explota cuando no hay ninguna variable', () => {
    expect(() => revisarEntorno({})).not.toThrow()
  })

  it('informa una entrada por cada requisito declarado', () => {
    const estado = revisarEntorno({})
    expect(estado.variables).toHaveLength(REQUISITOS.length)
  })

  it('marca todo como ausente y no listo cuando el entorno está vacío', () => {
    const estado = revisarEntorno({})
    expect(estado.variables.every((v) => !v.presente)).toBe(true)
    expect(estado.listo).toBe(false)
  })

  it('marca como presente una variable con valor', () => {
    const estado = revisarEntorno({ META_APP_ID: '2324064161428607' })
    const appId = estado.variables.find((v) => v.nombre === 'META_APP_ID')
    expect(appId?.presente).toBe(true)
  })

  it('trata la cadena vacía como ausente', () => {
    const estado = revisarEntorno({ META_APP_ID: '' })
    const appId = estado.variables.find((v) => v.nombre === 'META_APP_ID')
    expect(appId?.presente).toBe(false)
  })

  it('trata una cadena de espacios como ausente', () => {
    const estado = revisarEntorno({ META_APP_ID: '   ' })
    const appId = estado.variables.find((v) => v.nombre === 'META_APP_ID')
    expect(appId?.presente).toBe(false)
  })

  it('está listo cuando todas las obligatorias tienen valor', () => {
    const estado = revisarEntorno(todasLasObligatorias())
    expect(estado.faltantesObligatorias).toEqual([])
    expect(estado.listo).toBe(true)
  })

  it('sigue listo aunque falten las opcionales', () => {
    const estado = revisarEntorno(todasLasObligatorias())
    const faltanOpcionales = estado.variables.some(
      (v) => !v.obligatoria && !v.presente,
    )
    expect(faltanOpcionales).toBe(true)
    expect(estado.listo).toBe(true)
  })

  it('lista solo las obligatorias entre las faltantes', () => {
    const estado = revisarEntorno({})
    const opcionales = REQUISITOS.filter((r) => !r.obligatoria).map((r) => r.nombre)
    expect(
      estado.faltantesObligatorias.some((n) => opcionales.includes(n)),
    ).toBe(false)
  })

  it('nunca expone el valor de una variable, solo si está o no', () => {
    const estado = revisarEntorno({ META_APP_SECRET: 'secreto-que-no-debe-salir' })
    expect(JSON.stringify(estado)).not.toContain('secreto-que-no-debe-salir')
  })
})

describe('REQUISITOS', () => {
  it('no declara nombres repetidos', () => {
    const nombres = REQUISITOS.map((r) => r.nombre)
    expect(new Set(nombres).size).toBe(nombres.length)
  })

  it('declara todas las variables que usa la ingesta de Meta', () => {
    const nombres = REQUISITOS.map((r) => r.nombre)
    expect(nombres).toContain('META_APP_ID')
    expect(nombres).toContain('META_APP_SECRET')
    expect(nombres).toContain('META_ACCESS_TOKEN')
  })

  it('cada requisito tiene una descripción que le sirva al usuario', () => {
    expect(REQUISITOS.every((r) => r.descripcion.trim().length > 0)).toBe(true)
  })
})
