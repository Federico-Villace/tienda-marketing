/**
 * Compresión de la foto en el navegador, ANTES de subirla. Re-encodear a JPEG
 * quita el EXIF (incluido el GPS) y deja la foto por debajo del límite de
 * Vercel (4,5 MB). El cálculo es puro; el canvas entra por dependencias para
 * poder testearlo sin navegador.
 */

export const MAX_LADO = 2048
export const MAX_BYTES_CLIENTE = 3_000_000
export const CALIDADES = [0.85, 0.75, 0.65, 0.55] as const

export function medidasObjetivo(ancho: number, alto: number, max = MAX_LADO): { ancho: number; alto: number } {
  const mayor = Math.max(ancho, alto)
  if (mayor <= max) return { ancho, alto }
  const k = max / mayor
  return { ancho: Math.round(ancho * k), alto: Math.round(alto * k) }
}

export type ImagenDecodificada = {
  readonly ancho: number
  readonly alto: number
  readonly dibujar: (ancho: number, alto: number) => void
  readonly cerrar: () => void
}

export type DepsCompresion = {
  /** Decodifica aplicando la orientación EXIF. */
  readonly decodificar: (archivo: Blob) => Promise<ImagenDecodificada>
  /** Dibuja en el canvas y lo exporta como JPEG de esa calidad. */
  readonly aBlob: (ancho: number, alto: number, calidad: number) => Promise<Blob | null>
}

export type ResultadoCompresion =
  | { readonly ok: true; readonly blob: Blob; readonly ancho: number; readonly alto: number }
  | { readonly ok: false; readonly error: string }

export async function comprimir(archivo: Blob, deps: DepsCompresion): Promise<ResultadoCompresion> {
  let img: ImagenDecodificada
  try {
    img = await deps.decodificar(archivo)
  } catch {
    return { ok: false, error: 'No se pudo leer la foto. Exportala a JPEG y probá de nuevo.' }
  }
  try {
    const { ancho, alto } = medidasObjetivo(img.ancho, img.alto)
    img.dibujar(ancho, alto)
    for (const calidad of CALIDADES) {
      const blob = await deps.aBlob(ancho, alto, calidad)
      if (!blob) return { ok: false, error: 'No se pudo comprimir la foto.' }
      if (blob.size < MAX_BYTES_CLIENTE) return { ok: true, blob, ancho, alto }
    }
    return { ok: false, error: 'La foto es demasiado pesada.' }
  } finally {
    img.cerrar()
  }
}

/** Adaptador real con canvas. Solo corre en el navegador. */
export function depsDeNavegador(): DepsCompresion {
  let canvas: HTMLCanvasElement | null = null
  return {
    decodificar: async (archivo) => {
      const bmp = await createImageBitmap(archivo, { imageOrientation: 'from-image' })
      return {
        ancho: bmp.width,
        alto: bmp.height,
        dibujar: (ancho, alto) => {
          canvas = document.createElement('canvas')
          canvas.width = ancho
          canvas.height = alto
          canvas.getContext('2d')!.drawImage(bmp, 0, 0, ancho, alto)
        },
        cerrar: () => bmp.close(),
      }
    },
    aBlob: (_ancho, _alto, calidad) => new Promise((ok) => canvas!.toBlob(ok, 'image/jpeg', calidad)),
  }
}
