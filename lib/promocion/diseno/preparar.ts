/**
 * Todo lo que hay que saber ANTES de dibujar una plantilla de diseño: el diseño completo, las cajas y los
 * tamaños de letra. Puro: lo comparten el servidor (PNG final) y el navegador (vista previa), y lanza
 * ErrorTextoLargo si algo no entra, sin dibujar nada.
 */

import type { AspectoFoto } from '../../productor/ediciones.ts'
import type { TextosPlaca } from '../plantillas.ts'
import type { DatosPromocion, IdPlantillaDiseno } from '../tipos.ts'
import { ajustarDiseno, type AjusteDiseno } from './ajuste.ts'
import { resolverDiseno } from './defaults.ts'
import { layoutDiseno, type LayoutDiseno } from './layouts.ts'
import type { Diseno, DisenoResuelto } from './tipos.ts'

export type DisenoPreparado = { diseno: DisenoResuelto; layout: LayoutDiseno; ajuste: AjusteDiseno }

export function prepararDiseno(p: {
  plantilla: IdPlantillaDiseno
  formato: AspectoFoto
  textos: TextosPlaca
  /** Lo guardado en promociones.diseno (null = defaults). */
  guardado: Diseno | null
  datos: DatosPromocion
}): DisenoPreparado {
  const diseno = resolverDiseno(p.guardado, p.plantilla, { modelo: p.textos.modelo, titular: p.textos.titular, datos: p.datos })
  const layout = layoutDiseno(p.plantilla, p.formato, diseno.posicionFrase)
  return { diseno, layout, ajuste: ajustarDiseno(p.textos, diseno, layout, p.plantilla) }
}
