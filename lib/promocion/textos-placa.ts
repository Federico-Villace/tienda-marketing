/** Lo que se escribe en la placa. Puro: lo usan el servidor (PNG final) y el navegador (vista previa). */

import { formatearPrecio, lineaPromo } from './datos.ts'
import type { TextosPlaca } from './plantillas.ts'
import type { DatosPromocion } from './tipos.ts'

export function textosParaPlaca(p: {
  marca: string
  modelo: string
  datos: DatosPromocion
  /** El titular que la persona dejó en el paso 4, si lo tocó. */
  titular: string | null
  /** El titular del texto elegido en el paso 3. */
  titularDelTexto: string | null
}): TextosPlaca {
  return {
    marca: p.marca,
    modelo: p.modelo,
    precio: formatearPrecio(p.datos.precio),
    promo: lineaPromo(p.datos.promo),
    titular: p.titular ?? p.titularDelTexto ?? '',
    lugar: p.datos.lugar,
  }
}
