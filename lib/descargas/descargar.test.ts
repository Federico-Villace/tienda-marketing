import { describe, it, expect, vi } from 'vitest'
import { AVISO_MANTENER_APRETADA, descargar, descargarTodas, type DepsDescarga } from './descargar'

const archivo = (nombre: string) => new File(['x'], nombre, { type: 'image/png' })

function deps(o: Partial<DepsDescarga> = {}): DepsDescarga & { orden: string[] } {
  const orden: string[] = []
  return {
    orden,
    puedeCompartirArchivos: () => false,
    traerArchivo: vi.fn(async (_u: string, n: string) => archivo(n)),
    compartir: vi.fn(async () => {}),
    clickEnlace: vi.fn((u: string) => void orden.push(`click:${u}`)),
    abrir: vi.fn(),
    esperar: vi.fn(async (ms: number) => void orden.push(`espera:${ms}`)),
    ...o,
  }
}
const a = { url: 'https://x/a.png', nombre: 'a.png' }
const b = { url: 'https://x/b.png', nombre: 'b.png' }
const c = { url: 'https://x/c.png', nombre: 'c.png' }
const abort = () => Object.assign(new Error('cancelado'), { name: 'AbortError' })

describe('descargar (una)', () => {
  it('en escritorio hace click en el enlace de descarga, sin fetch ni compartir', async () => {
    const d = deps()
    const r = await descargar(a, d)
    expect(d.clickEnlace).toHaveBeenCalledWith(a.url, a.nombre)
    expect(d.traerArchivo).not.toHaveBeenCalled()
    expect(d.compartir).not.toHaveBeenCalled()
    expect(r).toEqual({ estado: 'descargada', cantidad: 1 })
  })

  it('en el celu trae el archivo y abre el menú de compartir (ahí está "Guardar imagen")', async () => {
    const d = deps({ puedeCompartirArchivos: () => true })
    const r = await descargar(a, d)
    expect(d.compartir).toHaveBeenCalledTimes(1)
    expect((d.compartir as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toHaveLength(1)
    expect(d.clickEnlace).not.toHaveBeenCalled()
    expect(r).toEqual({ estado: 'compartida', cantidad: 1 })
  })

  it('si la persona cierra el menú de compartir no es un error: no hace nada más', async () => {
    const d = deps({ puedeCompartirArchivos: () => true, compartir: vi.fn(async () => { throw abort() }) })
    const r = await descargar(a, d)
    expect(r).toEqual({ estado: 'cancelada', cantidad: 0 })
    expect(d.abrir).not.toHaveBeenCalled()
    expect(d.clickEnlace).not.toHaveBeenCalled()
  })

  it('si compartir falla abre la imagen y explica cómo guardarla', async () => {
    const d = deps({ puedeCompartirArchivos: () => true, traerArchivo: vi.fn(async () => { throw new Error('cors') }) })
    const r = await descargar(a, d)
    expect(d.abrir).toHaveBeenCalledWith(a.url)
    expect(r).toEqual({ estado: 'abierta', cantidad: 1, aviso: AVISO_MANTENER_APRETADA })
    expect(AVISO_MANTENER_APRETADA).toBe('Mantené apretada la imagen para guardarla.')
  })

  it('si el click del enlace falla también abre la imagen con el aviso', async () => {
    const d = deps({ clickEnlace: vi.fn(() => { throw new Error('bloqueado') }) })
    const r = await descargar(a, d)
    expect(d.abrir).toHaveBeenCalledWith(a.url)
    expect(r.estado).toBe('abierta')
  })
})

describe('descargarTodas', () => {
  it('en escritorio baja una por una, en orden y con una pausa entre cada una (no después de la última)', async () => {
    const d = deps()
    const r = await descargarTodas([a, b, c], d)
    expect(d.orden).toEqual([`click:${a.url}`, 'espera:400', `click:${b.url}`, 'espera:400', `click:${c.url}`])
    expect(r).toEqual({ estado: 'descargada', cantidad: 3 })
  })

  it('respeta la pausa pedida', async () => {
    const d = deps()
    await descargarTodas([a, b], d, { pausaMs: 1000 })
    expect(d.orden).toContain('espera:1000')
  })

  it('en el celu las trae todas y las comparte en UN solo menú', async () => {
    const d = deps({ puedeCompartirArchivos: () => true })
    const r = await descargarTodas([a, b, c], d)
    expect(d.compartir).toHaveBeenCalledTimes(1)
    expect((d.compartir as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toHaveLength(3)
    expect(d.clickEnlace).not.toHaveBeenCalled()
    expect(r).toEqual({ estado: 'compartida', cantidad: 3 })
  })

  it('cerrar el menú de compartir no hace nada más', async () => {
    const d = deps({ puedeCompartirArchivos: () => true, compartir: vi.fn(async () => { throw abort() }) })
    const r = await descargarTodas([a, b], d)
    expect(r.estado).toBe('cancelada')
    expect(d.abrir).not.toHaveBeenCalled()
  })

  it('si compartir falla abre la primera imagen y avisa cómo guardar', async () => {
    const d = deps({ puedeCompartirArchivos: () => true, compartir: vi.fn(async () => { throw new Error('no') }) })
    const r = await descargarTodas([a, b], d)
    expect(d.abrir).toHaveBeenCalledTimes(1)
    expect(d.abrir).toHaveBeenCalledWith(a.url)
    expect(r).toMatchObject({ estado: 'abierta', aviso: AVISO_MANTENER_APRETADA })
  })

  it('sin nada que bajar no hace nada', async () => {
    const d = deps()
    const r = await descargarTodas([], d)
    expect(r).toEqual({ estado: 'vacia', cantidad: 0 })
    expect(d.clickEnlace).not.toHaveBeenCalled()
    expect(d.compartir).not.toHaveBeenCalled()
  })
})
