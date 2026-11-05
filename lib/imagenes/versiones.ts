/** Los nombres de las versiones de una imagen: por orden de creación, sin ids ni números de motor. */

import type { VersionImagen } from '../productor/pantalla.ts'

/** generacionId -> "Original", "Versión 2", "Versión 3 · Cambio: «…»". La primera creada es el Original. */
export function rotularVersiones(versiones: readonly VersionImagen[]): Map<string, string> {
  const porFecha = [...versiones].sort((a, b) => a.generacion.creadoEn.localeCompare(b.generacion.creadoEn))
  return new Map(
    porFecha.map((v, i) => {
      const base = i === 0 ? 'Original' : `Versión ${i + 1}`
      return [v.generacion.id, v.cambio ? `${base} · Cambio: «${v.cambio.instruccion}»` : base]
    }),
  )
}
