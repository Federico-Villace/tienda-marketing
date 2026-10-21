/**
 * Catálogo de motores y estimador de costo.
 *
 * Esta es la COMPUERTA: nada se genera sin que antes el usuario vea en pantalla
 * cuánto va a costar y lo confirme. Es el único lugar del producto donde un bug
 * se traduce directo en plata, por eso está testeado contra los dos casos
 * documentados en docs/05-costos-ia.md.
 *
 * Imagen: precios oficiales de Google (verificados el 2026-10-19), derivados de
 * lib/productor/precios.ts, que es la única fuente. Video: precios de
 * comparativas, marcados `referencial` (no se puede generar).
 */

import { MOTOR_IMAGEN_POR_DEFECTO, PRECIOS_IMAGEN } from '../productor/precios.ts'

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
  /** Precio de comparativa, no se puede generar con este motor. */
  readonly referencial?: boolean
}

const NO_DISPONIBLE = 'Referencial, no disponible: el video es un cambio aparte.'

const DE_IMAGEN: readonly Motor[] = Object.entries(PRECIOS_IMAGEN).map(([id, p]) => ({
  id,
  nombre: p.nombre,
  tipo: 'imagen',
  unidad: 'imagen',
  precioMin: p.porImagen1K,
  precioMax: p.porImagen1K,
  nota: p.nota,
  ...(id === MOTOR_IMAGEN_POR_DEFECTO ? { pordefecto: true } : {}),
}))

const video = (id: string, nombre: string, min: number, max: number, extra?: Partial<Motor>): Motor => ({
  id,
  nombre,
  tipo: 'video',
  unidad: 'segundo',
  precioMin: min,
  precioMax: max,
  nota: NO_DISPONIBLE,
  referencial: true,
  ...extra,
})

export const MOTOR_VIDEO_REFERENCIAL = 'runway-gen4-turbo'

export const MOTORES: readonly Motor[] = [
  // ── Imagen · precios oficiales de Google (lib/productor/precios.ts) ──
  ...DE_IMAGEN,

  // ── Video · referencial: no hay generación de video todavía ──────────
  video(MOTOR_VIDEO_REFERENCIAL, 'Runway Gen-4 Turbo', 0.05, 0.05, { pordefecto: true }),
  video('kling-3', 'Kling 3.0', 0.09, 0.14),
  video('sora-2', 'Sora 2', 0.1, 0.1),
  video('gemini-omni-1.1-flash', 'Gemini Omni 1.1 Flash', 0.1, 0.1),
  video('runway-gen4-5', 'Runway Gen-4.5', 0.12, 0.12),
  video('sora-2-pro', 'Sora 2 Pro', 0.3, 0.5),
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
