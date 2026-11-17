/** Los logos que lleva la grilla de motos (ADR-041): el 999 y el de la concesionaria sobre el fondo oscuro de la placa. Puro: el servidor los carga como data URIs y el navegador como URLs. */

import type { Ocultable } from '../diseno/tipos.ts'
import { idRecursoLogo, type IdsRecursos } from '../diseno/recursos-ids.ts'
import { elegirLogo, esDibujable, type ManifiestoLeido } from '../logos.ts'

export function idsDeRecursosGrilla(m: ManifiestoLeido, marcaId: string, ocultos: readonly Ocultable[]): IdsRecursos {
  const propio = ocultos.includes('logoConcesionaria') ? null : elegirLogo(m, marcaId, 'oscuro')
  // Un logo que satori no sabe leer (WebP) se trata como faltante: va el nombre en texto.
  const dibujable = propio && esDibujable(propio) ? propio : null
  return {
    logo999: ocultos.includes('logo999') ? null : 'logo999',
    logoConcesionaria: dibujable ? idRecursoLogo(marcaId, dibujable.id) : null,
    logoMarca: null,
    textura: null,
    raspado: null,
    placaClara: Boolean(dibujable?.placaClara),
  }
}
