/** De la fila de la base a lo que ve la pantalla. La ruta de la placa no sale del servidor. */

import { pasoActual } from './paso.ts'
import type { FilaPromocion, PromocionVista } from './tipos.ts'

export function vistaDePromocion(x: FilaPromocion): PromocionVista {
  const base = {
    estado: x.estado,
    analisisId: x.analisis_id,
    textosId: x.textos_id,
    copy: x.copy,
    plantilla: x.plantilla,
    escenaCreativoId: x.escena_creativo_id,
    placaLista: x.placa_ruta !== null,
  }
  return {
    id: x.id,
    estado: x.estado,
    revision: x.revision,
    marcaId: x.marca_id,
    modelo: x.modelo,
    datos: x.datos,
    fotoId: x.foto_id,
    aspecto: x.aspecto,
    plantilla: x.plantilla,
    fondo: x.fondo,
    analisisId: x.analisis_id,
    textosId: x.textos_id,
    copy: x.copy,
    copyOpcion: x.copy_opcion,
    copyEditado: x.copy_editado,
    titular: x.titular,
    fondoDescripcion: x.fondo_descripcion,
    posicionMoto: x.posicion_moto,
    lineaExtra: x.linea_extra,
    inspiracionFotoId: x.inspiracion_foto_id,
    escenaCreativoId: x.escena_creativo_id,
    placaLista: base.placaLista,
    tandaId: x.tanda_id,
    grupo: x.grupo ?? null,
    variante: x.variante ?? null,
    creadoEn: x.creado_en,
    actualizadoEn: x.actualizado_en,
    pasoActual: pasoActual(base),
  }
}
