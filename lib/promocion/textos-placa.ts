/** Lo que se escribe en la placa. Puro: lo usan el servidor (PNG final) y el navegador (vista previa). */

import type { Ocultable } from './diseno/tipos.ts'
import { formatearPrecio, lineaPromo } from './datos.ts'
import type { TextosPlaca } from './plantillas.ts'
import { esPlantillaClasica, type DatosPromocion } from './tipos.ts'

export function textosParaPlaca(p: {
  marca: string
  modelo: string
  datos: DatosPromocion
  /** El titular que la persona dejó en el paso 4, si lo tocó. */
  titular: string | null
  /** El titular del texto elegido en el paso 3. */
  titularDelTexto: string | null
  /** La línea extra que escribió la persona, si la escribió. */
  lineaExtra: string | null
  /** Solo las placas CLÁSICAS: lo que la persona sacó (diseno.ocultos). Un texto sacado queda vacío y no se dibuja. */
  ocultos?: readonly Ocultable[]
}): TextosPlaca {
  const fuera = (o: Ocultable) => p.ocultos?.includes(o) ?? false
  const sin = (o: Ocultable, t: string) => (fuera(o) ? '' : t)
  return {
    marca: fuera('logo999') || fuera('logoConcesionaria') ? '' : p.marca,
    modelo: sin('modelo', p.modelo),
    precio: sin('precio', formatearPrecio(p.datos.precio)),
    promo: sin('condicion', lineaPromo(p.datos.promo)),
    titular: sin('frase', p.titular ?? p.titularDelTexto ?? ''),
    extra: p.lineaExtra?.trim() ?? '',
    lugar: sin('lugar', p.datos.lugar),
  }
}

/** Los ocultos que cuentan para una placa clásica; en las de diseño los maneja el propio diseño (no se vacían los textos). */
export const ocultosDeClasica = (plantilla: unknown, diseno: { ocultos?: readonly Ocultable[] } | null): readonly Ocultable[] | undefined =>
  esPlantillaClasica(plantilla) && diseno?.ocultos && diseno.ocultos.length > 0 ? diseno.ocultos : undefined
