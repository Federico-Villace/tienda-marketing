/**
 * Bajar una o varias imágenes. Sin dependencias y con todo lo del navegador inyectable (para
 * probarlo sin navegador).
 *
 * - Escritorio: un click en un enlace de descarga por imagen, de a una y con una pausa (si no, Chrome
 *   bloquea las que llegan juntas). Chrome puede preguntar UNA vez "permitir varias descargas".
 * - Celu (el navegador sabe compartir archivos): se traen las imágenes y se abre el menú de compartir
 *   con todas: en Android y iPhone ahí está "Guardar imagen", que es lo que la gente espera.
 * - Si algo falla: se abre la imagen y se explica cómo guardarla a mano.
 * No hay zip a propósito: sumaría una dependencia y armar el archivo en la memoria del celu.
 */

export type ItemDescarga = { url: string; nombre: string }

export type DepsDescarga = {
  /** El navegador puede compartir archivos (celu con menú de compartir). */
  puedeCompartirArchivos: () => boolean
  traerArchivo: (url: string, nombre: string) => Promise<File>
  compartir: (archivos: File[]) => Promise<void>
  /** Click en un enlace <a download>. */
  clickEnlace: (url: string, nombre: string) => void
  abrir: (url: string) => void
  esperar: (ms: number) => Promise<void>
}

export type ResultadoDescarga = {
  estado: 'descargada' | 'compartida' | 'cancelada' | 'abierta' | 'vacia'
  cantidad: number
  /** Qué hacer a mano, si hizo falta abrir la imagen. */
  aviso?: string
}

export const AVISO_MANTENER_APRETADA = 'Mantené apretada la imagen para guardarla.'
const PAUSA_MS = 400

const esAbort = (e: unknown) => typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError'

/** Último recurso: abre la imagen (la primera) y le dice a la persona cómo guardarla. */
function abierta(item: ItemDescarga, cantidad: number, deps: DepsDescarga): ResultadoDescarga {
  deps.abrir(item.url)
  return { estado: 'abierta', cantidad, aviso: AVISO_MANTENER_APRETADA }
}

async function compartirTodas(items: readonly ItemDescarga[], deps: DepsDescarga): Promise<ResultadoDescarga> {
  try {
    const archivos = await Promise.all(items.map((i) => deps.traerArchivo(i.url, i.nombre)))
    await deps.compartir(archivos)
    return { estado: 'compartida', cantidad: items.length }
  } catch (e) {
    if (esAbort(e)) return { estado: 'cancelada', cantidad: 0 }
    return abierta(items[0]!, items.length, deps)
  }
}

export async function descargar(item: ItemDescarga, deps: DepsDescarga): Promise<ResultadoDescarga> {
  if (deps.puedeCompartirArchivos()) return compartirTodas([item], deps)
  try {
    deps.clickEnlace(item.url, item.nombre)
    return { estado: 'descargada', cantidad: 1 }
  } catch {
    return abierta(item, 1, deps)
  }
}

export async function descargarTodas(items: readonly ItemDescarga[], deps: DepsDescarga, { pausaMs = PAUSA_MS }: { pausaMs?: number } = {}): Promise<ResultadoDescarga> {
  if (items.length === 0) return { estado: 'vacia', cantidad: 0 }
  if (deps.puedeCompartirArchivos()) return compartirTodas(items, deps)
  try {
    for (const [i, item] of items.entries()) {
      if (i > 0) await deps.esperar(pausaMs)
      deps.clickEnlace(item.url, item.nombre)
    }
    return { estado: 'descargada', cantidad: items.length }
  } catch {
    return abierta(items[0]!, items.length, deps)
  }
}
