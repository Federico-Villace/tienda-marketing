/**
 * Qué recursos (logos y texturas) lleva una placa de diseño, como ids de /api/placa-recursos. Puro: el servidor
 * los convierte en data URIs para dibujar y el navegador en URLs para la vista previa.
 */

import type { IdPlantillaDiseno } from '../tipos.ts'
import { elegirLogo, esDibujable, logosDeMarca, type ManifiestoLeido } from '../logos.ts'
import { PLANTILLAS_DISENO } from './catalogo.ts'
import type { TonoFondo } from '../logos.ts'

export type IdsRecursos = {
  /** null = la placa no lleva el logo 999 (la copia fiel pega UN logo por su cuenta). */
  logo999: string | null
  /** null = la concesionaria no tiene logo: la placa escribe su nombre. */
  logoConcesionaria: string | null
  logoMarca: string | null
  textura: string | null
  raspado: string | null
  /** El logo de la concesionaria necesita una placa blanca detrás cuando el fondo es oscuro (manifiesto: placaClara). */
  placaClara: boolean
}

export const idRecursoLogo = (marcaId: string, logoId: string): string => `${marcaId}_${logoId}`

/** `tono`: solo la plantilla 'referencia', cuyo fondo sale de lo leído (las demás tienen uno fijo). */
export function idsDeRecursosDe(m: ManifiestoLeido, marcaId: string, plantilla: IdPlantillaDiseno, logoMarca: string | null, tono?: TonoFondo): IdsRecursos {
  const tonoFondo = tono ?? PLANTILLAS_DISENO[plantilla].tono
  const propio = elegirLogo(m, marcaId, tonoFondo)
  const deMarca = logoMarca ? logosDeMarca(m, marcaId).find((l) => l.id === logoMarca) : undefined
  return {
    logo999: 'logo999',
    // Un logo que satori no sabe leer (WebP) se trata como faltante: va el nombre en texto (avisosLogo lo avisa).
    logoConcesionaria: propio && esDibujable(propio) ? idRecursoLogo(marcaId, propio.id) : null,
    logoMarca: deMarca && esDibujable(deMarca) ? idRecursoLogo(marcaId, deMarca.id) : null,
    textura: plantilla === 'impactante_textura' ? 'textura-grunge' : null,
    raspado: plantilla === 'impactante_textura' ? 'textura-raspado' : null,
    placaClara: Boolean(propio && esDibujable(propio) && propio.placaClara && tonoFondo === 'oscuro'),
  }
}
