/**
 * Catálogo de motores y estimador de costo.
 *
 * Esta es la COMPUERTA: nada se genera sin que antes el usuario vea en pantalla
 * cuánto va a costar y lo confirme. Es el único lugar del producto donde un bug
 * se traduce directo en plata, por eso está testeado contra los dos casos
 * documentados en docs/05-costos-ia.md.
 *
 * Precios relevados el 22-sep-2026 sobre comparativas públicas. Antes de
 * comprometer un número con el cliente hay que confirmarlos contra la página
 * oficial de cada proveedor y sumarles un 20% de colchón.
 */

export type TipoMotor = 'imagen' | 'video'

export type Motor = {
  readonly id: string
  readonly nombre: string
  readonly tipo: TipoMotor
  readonly unidad: 'imagen' | 'segundo'
  readonly precioMin: number
  readonly precioMax: number
  readonly nota: string
  /** El que se usa por defecto: siempre el económico. */
  readonly pordefecto?: boolean
}

export const MOTORES: readonly Motor[] = [
  // ── Imagen · precio por unidad ──────────────────────────────
  {
    id: 'gpt-image-2',
    nombre: 'GPT Image 2',
    tipo: 'imagen',
    unidad: 'imagen',
    precioMin: 0.002,
    precioMax: 0.003,
    nota: 'Lo más barato. Para pruebas y volumen.',
  },
  {
    id: 'flux-2-pro',
    nombre: 'Flux 2 Pro',
    tipo: 'imagen',
    unidad: 'imagen',
    precioMin: 0.02,
    precioMax: 0.02,
    nota: 'Arranque del proyecto. Buen equilibrio.',
    pordefecto: true,
  },
  {
    id: 'seedream-4-5',
    nombre: 'Seedream 4.5',
    tipo: 'imagen',
    unidad: 'imagen',
    precioMin: 0.04,
    precioMax: 0.04,
    nota: 'Alternativa de estilo.',
  },
  {
    id: 'imagen-4',
    nombre: 'Imagen 4',
    tipo: 'imagen',
    unidad: 'imagen',
    precioMin: 0.05,
    precioMax: 0.05,
    nota: 'Calidad alta.',
  },
  {
    id: 'nano-banana-pro',
    nombre: 'Nano Banana Pro',
    tipo: 'imagen',
    unidad: 'imagen',
    precioMin: 0.2,
    precioMax: 0.2,
    nota: 'Pieza final. 10× el precio de Flux.',
  },

  // ── Video · precio por segundo ──────────────────────────────
  {
    id: 'runway-gen4-turbo',
    nombre: 'Runway Gen-4 Turbo',
    tipo: 'video',
    unidad: 'segundo',
    precioMin: 0.05,
    precioMax: 0.05,
    nota: 'Arranque del proyecto.',
    pordefecto: true,
  },
  {
    id: 'kling-3',
    nombre: 'Kling 3.0',
    tipo: 'video',
    unidad: 'segundo',
    precioMin: 0.09,
    precioMax: 0.14,
    nota: 'El precio sube con resolución y audio nativo.',
  },
  {
    id: 'sora-2',
    nombre: 'Sora 2',
    tipo: 'video',
    unidad: 'segundo',
    precioMin: 0.1,
    precioMax: 0.1,
    nota: 'Buen equilibrio.',
  },
  {
    id: 'runway-gen4-5',
    nombre: 'Runway Gen-4.5',
    tipo: 'video',
    unidad: 'segundo',
    precioMin: 0.12,
    precioMax: 0.12,
    nota: 'Calidad alta.',
  },
  {
    id: 'veo-3-1-fast',
    nombre: 'Veo 3.1 Fast',
    tipo: 'video',
    unidad: 'segundo',
    precioMin: 0.15,
    precioMax: 0.15,
    nota: 'Borradores con audio.',
  },
  {
    id: 'sora-2-pro',
    nombre: 'Sora 2 Pro',
    tipo: 'video',
    unidad: 'segundo',
    precioMin: 0.3,
    precioMax: 0.5,
    nota: 'Física cinematográfica, audio sincronizado.',
  },
  {
    id: 'veo-3-1',
    nombre: 'Veo 3.1 Standard',
    tipo: 'video',
    unidad: 'segundo',
    precioMin: 0.75,
    precioMax: 0.75,
    nota: '4K y la mejor sincronía labial. El más caro.',
  },
]

export const buscarMotor = (id: string): Motor | undefined =>
  MOTORES.find((m) => m.id === id)

/** Falla fuerte: es preferible romper a cobrar un número inventado. */
function exigirMotor(id: string): Motor {
  const motor = buscarMotor(id)
  if (!motor) throw new Error(`Motor desconocido: ${id}`)
  return motor
}

export type Pedido = {
  readonly imagenes: number
  readonly motorImagen: string
  readonly videos: number
  readonly segundosPorVideo: number
  readonly motorVideo: string
}

export type ItemEstimado = {
  readonly concepto: string
  readonly motor: string
  readonly cantidad: number
  readonly detalle: string
  readonly min: number
  readonly max: number
}

export type Estimacion = {
  readonly items: readonly ItemEstimado[]
  readonly totalMin: number
  readonly totalMax: number
  readonly esRango: boolean
}

/** Una cantidad negativa es un error de entrada, no un descuento. */
const noNegativo = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0)

export function estimar(pedido: Pedido): Estimacion {
  const items: ItemEstimado[] = []

  const imagenes = noNegativo(pedido.imagenes)
  if (imagenes > 0) {
    const motor = exigirMotor(pedido.motorImagen)
    items.push({
      concepto: 'Imágenes',
      motor: motor.nombre,
      cantidad: imagenes,
      detalle: `${imagenes} × USD ${motor.precioMin}`,
      min: imagenes * motor.precioMin,
      max: imagenes * motor.precioMax,
    })
  }

  const videos = noNegativo(pedido.videos)
  const segundos = noNegativo(pedido.segundosPorVideo)
  if (videos > 0 && segundos > 0) {
    const motor = exigirMotor(pedido.motorVideo)
    const totalSegundos = videos * segundos
    items.push({
      concepto: 'Videos',
      motor: motor.nombre,
      cantidad: videos,
      detalle: `${videos} × ${segundos}s × USD ${motor.precioMin}/s`,
      min: totalSegundos * motor.precioMin,
      max: totalSegundos * motor.precioMax,
    })
  }

  const totalMin = items.reduce((t, i) => t + i.min, 0)
  const totalMax = items.reduce((t, i) => t + i.max, 0)

  return { items, totalMin, totalMax, esRango: totalMax > totalMin }
}
