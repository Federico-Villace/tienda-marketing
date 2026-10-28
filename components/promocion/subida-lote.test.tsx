import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { usarSubidaLote } from './subida-lote'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const comprimirOk = vi.fn(async () => ({ ok: true as const, blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), ancho: 1500, alto: 1500 }))
const archivo = (n = 1) => new File([new Uint8Array([n])], `IMG_${n}.jpg`, { type: 'image/jpeg' })

afterEach(() => {
  vi.unstubAllGlobals()
  comprimirOk.mockClear()
})

/** Un /api/fotos que tarda un poco y cuenta cuántas subidas hay en vuelo a la vez. */
function servidor(o: { falla?: (n: number) => boolean } = {}) {
  let enVuelo = 0
  let maximo = 0
  let n = 0
  const cuerpos: FormData[] = []
  const f = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
    const mia = ++n
    cuerpos.push(init!.body as FormData)
    enVuelo++
    maximo = Math.max(maximo, enVuelo)
    await new Promise((r) => setTimeout(r, 10))
    enVuelo--
    if (o.falla?.(mia)) return json({ error: 'La foto pesa demasiado.' }, 413)
    return json({ foto: { id: `foto-${mia}`, ancho: 1500, alto: 1500, url: null } }, 201)
  })
  vi.stubGlobal('fetch', f)
  return { f, cuerpos, maximo: () => maximo }
}

describe('usarSubidaLote', () => {
  it('una foto elegida sin la declaración de derechos queda en cola y NO se sube', async () => {
    const s = servidor()
    const { result } = renderHook(() => usarSubidaLote({ derechos: false, comprimirFoto: comprimirOk }))
    act(() => result.current.elegir('a', archivo()))
    expect(result.current.filas.a).toMatchObject({ estado: 'en_cola', fotoId: null })
    await new Promise((r) => setTimeout(r, 30))
    expect(s.f).not.toHaveBeenCalled()
  })

  it('al aceptar la declaración arranca la cola; cada foto viaja con derechos=acepto', async () => {
    const s = servidor()
    const { result, rerender } = renderHook(({ d }) => usarSubidaLote({ derechos: d, comprimirFoto: comprimirOk }), { initialProps: { d: false } })
    act(() => result.current.elegir('a', archivo()))
    rerender({ d: true })
    await waitFor(() => expect(result.current.filas.a).toMatchObject({ estado: 'lista', fotoId: 'foto-1' }))
    expect(s.cuerpos[0]!.get('derechos')).toBe('acepto')
    expect(s.cuerpos[0]!.get('uso')).toBeNull()
    expect(s.cuerpos[0]!.get('foto')).toBeInstanceOf(Blob)
  })

  it('sube de a 2 como máximo (5 fotos, nunca más de 2 a la vez) y todas terminan', async () => {
    const s = servidor()
    const { result } = renderHook(() => usarSubidaLote({ derechos: true, comprimirFoto: comprimirOk }))
    act(() => {
      for (const k of ['a', 'b', 'c', 'd', 'e']) result.current.elegir(k, archivo())
    })
    await waitFor(() => expect(Object.values(result.current.filas).every((x) => x.estado === 'lista')).toBe(true))
    expect(s.maximo()).toBe(2)
    expect(s.f).toHaveBeenCalledTimes(5)
    expect(new Set(Object.values(result.current.filas).map((x) => x.fotoId)).size).toBe(5)
  })

  it('una que falla queda con su error y se reintenta; las demás no se frenan', async () => {
    const s = servidor({ falla: (n) => n === 1 })
    const { result } = renderHook(() => usarSubidaLote({ derechos: true, comprimirFoto: comprimirOk }))
    act(() => {
      result.current.elegir('a', archivo())
      result.current.elegir('b', archivo(2))
    })
    await waitFor(() => expect(result.current.filas.a?.estado).toBe('error'))
    await waitFor(() => expect(result.current.filas.b?.estado).toBe('lista'))
    expect(result.current.filas.a!.error).toBe('La foto pesa demasiado.')
    act(() => result.current.reintentar('a'))
    await waitFor(() => expect(result.current.filas.a?.estado).toBe('lista'))
    expect(s.f).toHaveBeenCalledTimes(3)
  })

  it('si la foto no se puede comprimir, es un error de esa fila y no se llama al servidor', async () => {
    const s = servidor()
    const mala = vi.fn(async () => ({ ok: false as const, error: 'No se pudo leer la foto.' }))
    const { result } = renderHook(() => usarSubidaLote({ derechos: true, comprimirFoto: mala }))
    act(() => result.current.elegir('a', archivo()))
    await waitFor(() => expect(result.current.filas.a).toMatchObject({ estado: 'error', error: 'No se pudo leer la foto.' }))
    expect(s.f).not.toHaveBeenCalled()
  })

  it('cambiar la foto de una fila descarta la anterior; quitar la vacía', async () => {
    servidor()
    const { result } = renderHook(() => usarSubidaLote({ derechos: true, comprimirFoto: comprimirOk }))
    act(() => result.current.elegir('a', archivo()))
    await waitFor(() => expect(result.current.filas.a?.estado).toBe('lista'))
    act(() => result.current.elegir('a', archivo(2)))
    expect(result.current.filas.a).toMatchObject({ fotoId: null })
    await waitFor(() => expect(result.current.filas.a).toMatchObject({ estado: 'lista', fotoId: 'foto-2' }))
    act(() => result.current.quitar('a'))
    expect(result.current.filas.a).toBeUndefined()
  })

  it('"listas(claves)" dice si TODAS las filas pedidas tienen foto arriba', async () => {
    servidor()
    const { result } = renderHook(() => usarSubidaLote({ derechos: true, comprimirFoto: comprimirOk }))
    expect(result.current.listas(['a', 'b'])).toBe(false)
    act(() => {
      result.current.elegir('a', archivo())
      result.current.elegir('b', archivo(2))
    })
    expect(result.current.listas(['a', 'b'])).toBe(false)
    await waitFor(() => expect(result.current.listas(['a', 'b'])).toBe(true))
    expect(result.current.listas([])).toBe(true)
  })
})
