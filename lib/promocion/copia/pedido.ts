/**
 * Lo que hace falta para PEDIR una imagen de copia fiel, común a la estimación de una promoción y a la de una tanda de marcas: los textos
 * esperados (snapshot y hash), el prompt, el modelo que verifica y su precio. Server-only (lee el manifiesto de logos). No toca la red.
 */

import { marcaPorId } from '../../datos/marcas.ts'
import { leerManifiesto } from '../logos-servidor.ts'
import type { FilaPromocion } from '../tipos.ts'
import { logoDibujable } from './logo.ts'
import { estimarVerificacion, modeloDeVerificacion } from './precios.ts'
import { promptCopiaFiel, VERSION_PROMPT_COPIA } from './prompt.ts'
import { promptCopiaFielMulti, VERSION_PROMPT_COPIA_MULTI } from './prompt-multi.ts'
import { textosCopiaFiel } from './textos.ts'
import { hashTextos } from './hash-textos.ts'
import type { TextosCopia } from './tipos.ts'

export { MOTOR_COPIA_POR_DEFECTO } from './tipos.ts'

/** Lo que la copia fiel lee de la promoción (un subconjunto de la fila). */
export type PromoParaCopia = Pick<FilaPromocion, 'marca_id' | 'modelo' | 'datos' | 'diseno' | 'titular' | 'copy' | 'motos_extra'>

/** Los textos que se le piden escribir a la IA para esta promoción. */
export function textosDeLaPromocion(p: PromoParaCopia): TextosCopia {
  return textosCopiaFiel(p as FilaPromocion, { negocio: marcaPorId(p.marca_id)?.nombre ?? '', logoDibujable: logoDibujable(leerManifiesto(), p.marca_id) })
}

export type PedidoCopia = {
  readonly prompt: string
  readonly version: string
  readonly textos: TextosCopia
  readonly textosHash: string
  readonly modeloVerificacion: string
  readonly verificacionUsd: number
}

/** Lanza si el modelo de verificación no tiene precio: mejor un error ANTES de insertar que un costo de 0 mentiroso. */
export function prepararCopiaFiel(promo: PromoParaCopia, aspecto: string, entorno: Record<string, string | undefined>): PedidoCopia {
  const modeloVerificacion = modeloDeVerificacion(entorno)
  const verificacionUsd = estimarVerificacion(modeloVerificacion).topeUsd
  const textos = textosDeLaPromocion(promo)
  // Varias motos en una placa (ADR-041): otro prompt y otra versión (una foto por moto, cada una con sus textos).
  const multi = textos.motos !== undefined
  return { prompt: multi ? promptCopiaFielMulti({ aspecto, textos }) : promptCopiaFiel({ aspecto, textos }), version: multi ? VERSION_PROMPT_COPIA_MULTI : VERSION_PROMPT_COPIA, textos, textosHash: hashTextos(textos), modeloVerificacion, verificacionUsd }
}
