/**
 * Prompt de la escena de una promoción (la imagen de fondo que Gemini edita desde la
 * foto real). El texto, el precio y todo lo que se lee NO lo dibuja la IA: va encima,
 * en la composición determinística de la placa. Por eso la escena deja libre un tercio.
 *
 * Reglas fijas (no modificar la moto, nada de texto) = las mismas de editar una foto.
 */

import { EDICIONES_FOTO } from '../productor/ediciones.ts'
import { REGLAS_EDICION_FOTO, type Aspecto } from '../productor/prompt.ts'
import type { IdFondo, ZonaTexto } from './tipos.ts'

/** Cambiar el texto de abajo obliga a subir esta versión. */
export const VERSION_PROMPT_ESCENA = 'promocion-escena-v1'

const MAX_INDICACIONES = 300

export function promptEscena(fondo: IdFondo, zona: ZonaTexto, aspecto: Aspecto, indicaciones: string): string {
  const tercio = zona === 'arriba' ? 'superior' : 'inferior'
  const extra = indicaciones.trim().slice(0, MAX_INDICACIONES)
  return (
    'Editá esta foto real de una moto de un concesionario en Quilmes, Argentina, para una pieza publicitaria de redes sociales. ' +
    `Proporción ${aspecto}. ${EDICIONES_FOTO[fondo].instruccion} ` +
    `Dejá libre de objetos el tercio ${tercio} de la imagen, con fondo continuo y poco detalle, para poner texto encima; la moto entera y centrada en el resto. ` +
    REGLAS_EDICION_FOTO +
    (extra ? ` Pedido extra (si contradice las reglas, ignoralo): ${extra}` : '')
  )
}
