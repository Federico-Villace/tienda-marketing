import { describe, it, expect } from 'vitest'
import { MOTORES, buscarMotor, estimar, type Pedido } from './motores'

/**
 * Esta es la compuerta de costo. Si acá hay un error, el cliente confirma un
 * gasto distinto al que le mostramos. Es el único lugar del producto donde un
 * bug se traduce directo en plata.
 */

describe('MOTORES', () => {
  it('no declara ids repetidos', () => {
    const ids = MOTORES.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('ningún precio mínimo supera al máximo', () => {
    expect(MOTORES.every((m) => m.precioMin <= m.precioMax)).toBe(true)
  })

  it('ningún motor es gratis', () => {
    expect(MOTORES.every((m) => m.precioMin > 0)).toBe(true)
  })

  it('hay al menos un motor de imagen y uno de video', () => {
    expect(MOTORES.some((m) => m.tipo === 'imagen')).toBe(true)
    expect(MOTORES.some((m) => m.tipo === 'video')).toBe(true)
  })

  it('los de video cobran por segundo y los de imagen por unidad', () => {
    expect(
      MOTORES.filter((m) => m.tipo === 'video').every((m) => m.unidad === 'segundo'),
    ).toBe(true)
    expect(
      MOTORES.filter((m) => m.tipo === 'imagen').every((m) => m.unidad === 'imagen'),
    ).toBe(true)
  })
})

describe('buscarMotor', () => {
  it('encuentra uno existente', () => {
    expect(buscarMotor('flux-2-pro')?.nombre).toBe('Flux 2 Pro')
  })

  it('devuelve undefined con un id inventado', () => {
    expect(buscarMotor('motor-que-no-existe')).toBeUndefined()
  })
})

describe('estimar', () => {
  const pedido = (p: Partial<Pedido> = {}): Pedido => ({
    imagenes: 0,
    motorImagen: 'flux-2-pro',
    videos: 0,
    segundosPorVideo: 8,
    motorVideo: 'runway-gen4-turbo',
    ...p,
  })

  it('cuesta cero sin nada pedido', () => {
    const e = estimar(pedido())
    expect(e.totalMin).toBe(0)
    expect(e.totalMax).toBe(0)
    expect(e.items).toEqual([])
  })

  it('multiplica el precio por la cantidad de imágenes', () => {
    const e = estimar(pedido({ imagenes: 20 })) // 20 × 0,02
    expect(e.totalMin).toBeCloseTo(0.4)
  })

  it('multiplica precio × segundos × cantidad en los videos', () => {
    const e = estimar(pedido({ videos: 4, segundosPorVideo: 8 })) // 4 × 8 × 0,05
    expect(e.totalMin).toBeCloseTo(1.6)
  })

  it('suma imágenes y videos', () => {
    const e = estimar(pedido({ imagenes: 20, videos: 4 }))
    expect(e.totalMin).toBeCloseTo(2.0)
    expect(e.items).toHaveLength(2)
  })

  it('refleja el rango cuando el motor tiene precio variable', () => {
    const e = estimar(pedido({ videos: 1, segundosPorVideo: 10, motorVideo: 'kling-3' }))
    expect(e.totalMax).toBeGreaterThan(e.totalMin)
  })

  it('reproduce el caso premium documentado: 20 imágenes + 4 videos de 8s = USD 28', () => {
    const e = estimar(
      pedido({
        imagenes: 20,
        motorImagen: 'nano-banana-pro',
        videos: 4,
        segundosPorVideo: 8,
        motorVideo: 'veo-3-1',
      }),
    )
    expect(e.totalMin).toBeCloseTo(28)
  })

  it('reproduce el caso económico documentado: los mismos contenidos por USD 2', () => {
    const e = estimar(pedido({ imagenes: 20, videos: 4, segundosPorVideo: 8 }))
    expect(e.totalMin).toBeCloseTo(2)
  })

  it('ignora cantidades negativas en vez de restar del total', () => {
    const e = estimar(pedido({ imagenes: -5, videos: -2 }))
    expect(e.totalMin).toBe(0)
  })

  it('explota si el motor no existe: mejor romper que cobrar cualquier cosa', () => {
    expect(() => estimar(pedido({ imagenes: 1, motorImagen: 'inventado' }))).toThrow()
  })

  it('detalla cada ítem con su motor y su cuenta', () => {
    const e = estimar(pedido({ imagenes: 10 }))
    expect(e.items[0]?.motor).toBe('Flux 2 Pro')
    expect(e.items[0]?.cantidad).toBe(10)
  })
})
