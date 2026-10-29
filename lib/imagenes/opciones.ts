/**
 * Las opciones de imagen que arma el SERVIDOR para las dos secciones (Promociones y /creativos):
 * fondos, motores y precios informativos salen de la misma función, así las dos pantallas ofrecen
 * lo mismo y un cambio futuro se hace una vez. Al estimar, el servidor recalcula el precio.
 */

import { MOTOR_IMAGEN_POR_DEFECTO, PRECIOS_IMAGEN, estimarImagenes, tienePrecioImagen } from '../productor/precios.ts'
import { fondosPara, OPCIONES_FONDO, type IdFondoImagen, type Seccion } from './fondos.ts'

export type MotorImagen = { id: string; nombre: string; porImagenUsd: number }

export type OpcionesImagen = {
  seccion: Seccion
  motores: MotorImagen[]
  motorPorDefecto: string
  fondos: { id: IdFondoImagen; nombre: string; descripcion: string }[]
  /** Tope por imagen con la foto de la moto (y con la de inspiración), para el aviso previo al "Ver precio". */
  topePorImagen: Record<string, { conFoto: number; conInspiracion: number }>
}

export function opcionesDeImagen(seccion: Seccion, motorConfigurado?: string | null): OpcionesImagen {
  const configurado = motorConfigurado?.trim()
  return {
    seccion,
    motores: Object.entries(PRECIOS_IMAGEN).map(([id, p]) => ({ id, nombre: p.nombre, porImagenUsd: p.porImagen1K })),
    motorPorDefecto: configurado && tienePrecioImagen(configurado) ? configurado : MOTOR_IMAGEN_POR_DEFECTO,
    fondos: fondosPara(seccion).map((id) => ({ id, nombre: OPCIONES_FONDO[id].nombre, descripcion: OPCIONES_FONDO[id].descripcion })),
    topePorImagen: Object.fromEntries(
      Object.keys(PRECIOS_IMAGEN).map((id) => [
        id,
        {
          conFoto: estimarImagenes(id, 1, { conFoto: true }).topePorImagenUsd,
          conInspiracion: estimarImagenes(id, 1, { conFoto: true, conReferencia: true }).topePorImagenUsd,
        },
      ]),
    ),
  }
}
