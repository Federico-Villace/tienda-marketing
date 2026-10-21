import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MOTORES, buscarMotor, estimar } from '@/lib/creativos/motores'

const fuente = readFileSync(join(process.cwd(), 'components/home/simulador.tsx'), 'utf8')

/** El pedido que cotiza el simulador, leído de su propio código. */
const pedido = () => {
  const bloque = fuente.match(/const PEDIDO_CREATIVOS = \{([\s\S]*?)\}/)![1]!
  const num = (k: string) => Number(bloque.match(new RegExp(`${k}: (\\d+)`))![1])
  const txt = (k: string) => bloque.match(new RegExp(`${k}: '([^']+)'`))![1]!
  return { imagenes: num('imagenes'), motorImagen: txt('motorImagen'), videos: num('videos'), segundosPorVideo: num('segundosPorVideo'), motorVideo: txt('motorVideo') }
}

describe('simulador de la home (S12.2)', () => {
  it('cotiza con ids que existen en el catálogo y estimar() no falla', () => {
    const p = pedido()
    expect(buscarMotor(p.motorImagen)).toBeDefined()
    expect(buscarMotor(p.motorVideo)).toBeDefined()
    expect(() => estimar(p)).not.toThrow()
  })

  it('solo cotiza lo que se puede generar: imágenes de un motor no referencial, sin videos', () => {
    const p = pedido()
    expect(MOTORES.find((m) => m.id === p.motorImagen)?.referencial).toBeFalsy()
    expect(p.videos).toBe(0)
  })

  it('los textos de la simulación no nombran motores que ya no existen', () => {
    expect(fuente).not.toMatch(/Flux|Veo 3\.1|Imagen 4|Nano Banana Pro/)
    expect(fuente).toMatch(/Nano Banana 2\.1/)
  })
})
