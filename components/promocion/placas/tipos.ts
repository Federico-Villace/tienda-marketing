import type { AjusteDiseno } from '@/lib/promocion/diseno/ajuste'
import type { LayoutDiseno } from '@/lib/promocion/diseno/layouts'
import type { DisenoResuelto } from '@/lib/promocion/diseno/tipos'
import type { IdFuente } from '@/lib/promocion/fuentes-placa'
import type { TextosPlaca } from '@/lib/promocion/plantillas'
import type { IdPlantillaDiseno } from '@/lib/promocion/tipos'

/** URL o data URI de cada recurso; null = no lleva. En el servidor son data URIs; en el navegador, /api/placa-recursos/<id>. */
export type RecursosPlaca = {
  logo999: string | null
  logoConcesionaria: string | null
  logoMarca: string | null
  textura: string | null
  raspado: string | null
  /** Una placa blanca detrás del logo de la concesionaria (logos de letras oscuras sobre fondo oscuro). */
  placaClara?: boolean
}

/** Nombre de familia de cada fuente: 'Anton' en el servidor, la variable de next/font en el navegador. */
export type FamiliasDiseno = Record<IdFuente, string>

export type PropsPlacaDiseno = {
  plantilla: IdPlantillaDiseno
  escenaSrc: string
  textos: TextosPlaca
  diseno: DisenoResuelto
  layout: LayoutDiseno
  ajuste: AjusteDiseno
  recursos: RecursosPlaca
  familias: FamiliasDiseno
  /** Se escribe en texto si la concesionaria no tiene logo. */
  nombreConcesionaria: string
}
