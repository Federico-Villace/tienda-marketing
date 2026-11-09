/** Las plantillas de diseño tal como se muestran y se arman: nombre, fondo sugerido, tono del fondo y fuentes. */

import { fuentesDe, type IdFuente } from '../fuentes-placa.ts'
import type { IdFondo, IdPlantillaDiseno } from '../tipos.ts'
import type { TonoFondo } from '../logos.ts'
import { acentosDe, BASE } from './paletas.ts'
import type { Acento } from './tipos.ts'

export type InfoPlantillaDiseno = {
  readonly nombre: string
  readonly descripcion: string
  /** El fondo que queda puesto al elegirla (los estudios de ediciones.ts). */
  readonly fondoSugerido: IdFondo
  /** Sobre qué fondo van los logos: decide qué versión del logo se usa. */
  readonly tono: TonoFondo
  readonly fuentes: readonly IdFuente[]
  readonly acentos: readonly Acento[]
}

const armar = (id: IdPlantillaDiseno, nombre: string, descripcion: string, fondoSugerido: IdFondo): InfoPlantillaDiseno => ({
  nombre,
  descripcion,
  fondoSugerido,
  tono: BASE[id].tono,
  fuentes: fuentesDe(id),
  acentos: acentosDe(id),
})

export const PLANTILLAS_DISENO: Record<IdPlantillaDiseno, InfoPlantillaDiseno> = {
  impactante_textura: armar('impactante_textura', 'Impactante', 'Fondo negro con textura, pinceladas de color, modelo gigante y frase manuscrita.', 'estudio_oscuro'),
  deportiva: armar('deportiva', 'Deportiva', 'Azul eléctrico con diagonales amarillo flúor, letras inclinadas y barra de precio.', 'estudio_azul'),
  editorial: armar('editorial', 'Editorial', 'Fondo crema con curvas de nivel, número gigante detrás de la moto y banda de precio.', 'estudio_crema'),
}
