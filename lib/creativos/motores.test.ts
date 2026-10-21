import { describe, it, expect } from 'vitest'
import { PRECIOS_IMAGEN } from '../productor/precios'
import { MOTORES, MOTOR_VIDEO_REFERENCIAL, buscarMotor, estimar, type Pedido } from './motores'

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

describe('catálogo coherente con el Productor (R12)', () => {
  it('S12.1 los motores de imagen son exactamente los de precios.ts, con su precio', () => {
    const imagen = MOTORES.filter((m) => m.tipo === 'imagen')
    expect(imagen.map((m) => m.id).sort()).toEqual(Object.keys(PRECIOS_IMAGEN).sort())
    for (const m of imagen) {
      expect(m.precioMin).toBe(PRECIOS_IMAGEN[m.id]!.porImagen1K)
      expect(m.precioMax).toBe(PRECIOS_IMAGEN[m.id]!.porImagen1K)
    }
    expect(buscarMotor('gemini-nano-banana-2.1')?.pordefecto).toBe(true)
  })

  it('S12.4 el video es referencial y no disponible; los de imagen no', () => {
    const video = MOTORES.filter((m) => m.tipo === 'video')
    expect(video.every((m) => m.referencial === true)).toBe(true)
    expect(MOTORES.filter((m) => m.tipo === 'imagen').every((m) => !m.referencial)).toBe(true)
    expect(MOTOR_VIDEO_REFERENCIAL).toBe('runway-gen4-turbo')
  })

  it('no quedan motores apagados: Veo 3.1, Imagen 4 ni los de comparativas viejas', () => {
    for (const id of ['veo-3-1', 'veo-3-1-fast', 'imagen-4', 'nano-banana-pro', 'flux-2-pro', 'gpt-image-2', 'seedream-4-5']) {
      expect(buscarMotor(id)).toBeUndefined()
    }
    expect(buscarMotor('gemini-omni-1.1-flash')?.precioMin).toBe(0.1)
  })
})

describe('buscarMotor', () => {
  it('encuentra uno existente', () => {
    expect(buscarMotor('gemini-3-pro-image')?.nombre).toBe('Gemini 3 Pro Image')
  })

  it('devuelve undefined con un id inventado', () => {
    expect(buscarMotor('motor-que-no-existe')).toBeUndefined()
  })
})

describe('estimar', () => {
  const pedido = (p: Partial<Pedido> = {}): Pedido => ({
    imagenes: 0,
    motorImagen: 'gemini-nano-banana-2.1',
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
    const e = estimar(pedido({ imagenes: 20 })) // 20 × 0,0336
    expect(e.totalMin).toBeCloseTo(0.672)
  })

  it('multiplica precio × segundos × cantidad en los videos', () => {
    const e = estimar(pedido({ videos: 4, segundosPorVideo: 8 })) // 4 × 8 × 0,05
    expect(e.totalMin).toBeCloseTo(1.6)
  })

  it('suma imágenes y videos', () => {
    const e = estimar(pedido({ imagenes: 20, videos: 4 }))
    expect(e.totalMin).toBeCloseTo(0.672 + 1.6)
    expect(e.items).toHaveLength(2)
  })

  it('refleja el rango cuando el motor tiene precio variable', () => {
    const e = estimar(pedido({ videos: 1, segundosPorVideo: 10, motorVideo: 'kling-3' }))
    expect(e.totalMax).toBeGreaterThan(e.totalMin)
  })

  it('S12.3 caso premium (imagen y video más caros del catálogo): 20 imágenes + 4 videos de 8s = USD 12,28', () => {
    const e = estimar(
      pedido({
        imagenes: 20,
        motorImagen: 'gemini-3-pro-image',
        videos: 4,
        segundosPorVideo: 8,
        motorVideo: 'sora-2-pro',
      }),
    )
    // 20 × 0,134 + 32 s × 0,30
    expect(e.totalMin).toBeCloseTo(12.28)
  })

  it('S12.3 caso económico: los mismos contenidos por USD 2,27', () => {
    const e = estimar(pedido({ imagenes: 20, videos: 4, segundosPorVideo: 8 }))
    expect(e.totalMin).toBeCloseTo(2.272)
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
    expect(e.items[0]?.motor).toBe('Nano Banana 2.1')
    expect(e.items[0]?.cantidad).toBe(10)
  })
})
