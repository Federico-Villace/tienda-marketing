import type { DepsDescarga } from './descargar'

/** Lo del navegador real. Solo se usa desde el cliente, en un click (nunca al renderizar). */
export function depsDelNavegador(): DepsDescarga {
  return {
    // Solo en pantallas táctiles: en escritorio compartir abriría un menú del sistema en vez de bajar el archivo.
    puedeCompartirArchivos: () => {
      if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function' || typeof navigator.share !== 'function') return false
      if (typeof window.matchMedia !== 'function' || !window.matchMedia('(pointer: coarse)').matches) return false
      return navigator.canShare({ files: [new File([], 'a.png', { type: 'image/png' })] })
    },
    traerArchivo: async (url, nombre) => {
      const r = await fetch(url)
      if (!r.ok) throw new Error(`No se pudo traer la imagen (${r.status}).`)
      const blob = await r.blob()
      return new File([blob], nombre, { type: blob.type || 'image/png' })
    },
    compartir: (archivos) => navigator.share({ files: archivos }),
    clickEnlace: (url, nombre) => {
      const a = document.createElement('a')
      a.href = url
      a.download = nombre
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
    },
    abrir: (url) => {
      window.open(url, '_blank', 'noopener')
    },
    esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
  }
}
