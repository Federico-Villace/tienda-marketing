import { describe, it, expect, vi } from 'vitest'
import { CALIDADES, comprimir, medidasObjetivo } from './redimensionar'

describe('medidasObjetivo (F6)', () => {
  it('S6.1 4032x3024 da 2048x1536', () => expect(medidasObjetivo(4032, 3024)).toEqual({ ancho: 2048, alto: 1536 }))
  it('vertical: 3024x4032 da 1536x2048', () => expect(medidasObjetivo(3024, 4032)).toEqual({ ancho: 1536, alto: 2048 }))
  it('S6.2 1000x800 queda igual (nunca agranda)', () => expect(medidasObjetivo(1000, 800)).toEqual({ ancho: 1000, alto: 800 }))
  it('el máximo es configurable', () => expect(medidasObjetivo(1000, 500, 500)).toEqual({ ancho: 500, alto: 250 }))
})

type Deps = Parameters<typeof comprimir>[1]

const armar = (tamanos: number[]) => {
  const dibujar = vi.fn()
  const cerrar = vi.fn()
  const calidades: number[] = []
  const deps: Deps = {
    decodificar: async () => ({ ancho: 4032, alto: 3024, dibujar, cerrar }),
    aBlob: async (ancho, alto, calidad) => {
      calidades.push(calidad)
      void ancho
      void alto
      const n = tamanos[calidades.length - 1] ?? tamanos.at(-1)!
      return new Blob([new Uint8Array(n)], { type: 'image/jpeg' })
    },
  }
  return { deps, dibujar, cerrar, calidades }
}

describe('comprimir (F6)', () => {
  it('las calidades a probar bajan de 0,85 a 0,55', () => expect(CALIDADES).toEqual([0.85, 0.75, 0.65, 0.55]))

  it('S6.3 la primera calidad que entra gana', async () => {
    const { deps, calidades, cerrar } = armar([3_500_000, 2_900_000, 1_000_000])
    const r = await comprimir(new Blob(['x']), deps)
    expect(r).toMatchObject({ ok: true })
    expect(calidades).toEqual([0.85, 0.75])
    expect(cerrar).toHaveBeenCalled()
    if (r.ok) expect(r.blob.size).toBe(2_900_000)
  })

  it('devuelve las medidas finales', async () => {
    const { deps } = armar([1000])
    const r = await comprimir(new Blob(['x']), deps)
    expect(r).toMatchObject({ ok: true, ancho: 2048, alto: 1536 })
  })

  it('si ninguna calidad entra, error de foto demasiado pesada', async () => {
    const { deps, calidades } = armar([5_000_000])
    const r = await comprimir(new Blob(['x']), deps)
    expect(r).toEqual({ ok: false, error: 'La foto es demasiado pesada.' })
    expect(calidades).toHaveLength(4)
  })

  it('si no se puede decodificar (HEIC en Chrome), pide exportar a JPEG', async () => {
    const r = await comprimir(new Blob(['x']), {
      decodificar: async () => {
        throw new Error('nope')
      },
      aBlob: async () => null,
    })
    expect(r).toMatchObject({ ok: false })
    if (!r.ok) expect(r.error).toMatch(/JPEG/)
  })

  it('si el canvas no produce blob, error genérico', async () => {
    const dep = armar([1])
    const r = await comprimir(new Blob(['x']), { ...dep.deps, aBlob: async () => null })
    expect(r).toMatchObject({ ok: false })
  })
})
