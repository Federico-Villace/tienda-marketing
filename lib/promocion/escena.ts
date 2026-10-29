/**
 * Prompt de la escena de una promoción (la imagen de fondo que Gemini edita desde la
 * foto real). El texto, el precio y todo lo que se lee NO lo dibuja la IA: va encima,
 * en la composición determinística de la placa. Por eso la escena deja libre un sector.
 *
 * Reglas fijas (no modificar la moto, nada de texto) = las mismas de editar una foto.
 * Lo que la persona pide para el FONDO (descripción, foto de inspiración) manda sobre el
 * fondo armado, pero nunca sobre la moto: va delimitado y las reglas van después y prevalecen.
 */

import { limpiarDescripcion } from '../agentes/texto-seguro.ts'
import { instruccionFondo } from '../imagenes/fondos.ts'
import { REGLAS_EDICION_FOTO, type Aspecto } from '../productor/prompt.ts'
import type { IdFondo, PosicionMoto, ZonaTexto } from './tipos.ts'

/**
 * Cambiar el texto de abajo obliga a subir esta versión.
 * v3: la descripción de la persona MANDA sobre el fondo armado (en la v2 el preset iba
 * primero como orden suelta y la descripción como "preferencia": ganaba el estudio gris),
 * y existe "solo mi descripción", que no manda ningún preset.
 */
export const VERSION_PROMPT_ESCENA = 'promocion-escena-v3'

export const MAX_DESCRIPCION_FONDO = 300

export type PedidoEscena = {
  fondo: IdFondo
  zona: ZonaTexto
  aspecto: Aspecto
  posicionMoto: PosicionMoto
  /** Lo que la persona escribió para el fondo (ya validado), o null. */
  descripcion: string | null
  /** Se manda una SEGUNDA imagen como inspiración. */
  conReferencia: boolean
}

export { limpiarDescripcion }

export function composicion(zona: ZonaTexto, moto: PosicionMoto): string {
  if (zona === 'izquierda' || zona === 'derecha') {
    const motoLado = zona === 'derecha' ? 'izquierda' : 'derecha'
    return `Dejá libre de objetos la mitad ${zona} de la imagen, con fondo continuo y poco detalle, para poner texto encima; la moto entera en la mitad ${motoLado}.`
  }
  const tercio = zona === 'arriba' ? 'superior' : 'inferior'
  const lugar = moto === 'centro' ? 'la moto entera y centrada' : `la moto entera, ubicada del lado ${moto === 'izquierda' ? 'izquierdo' : 'derecho'} de la imagen,`
  return `Dejá libre de objetos el tercio ${tercio} de la imagen, con fondo continuo y poco detalle, para poner texto encima; ${lugar} en el resto.`
}

const REFERENCIA =
  'Se adjuntan dos imágenes. La PRIMERA es la foto real de la moto: es la única moto que tiene que aparecer. ' +
  'La SEGUNDA es solo una referencia de estilo, luz, paleta y ambiente: no copies objetos, textos, logos ni personas de esa imagen, y no uses su moto.'

/** La descripción ya limpia y recortada, o '' si no hay. */
export function descripcionLimpia(texto: string | null): string {
  return texto ? limpiarDescripcion(texto).slice(0, MAX_DESCRIPCION_FONDO) : ''
}

/** "Solo mi descripción" necesita algo de dónde sacar el fondo: el texto o la inspiración. */
export function faltaPedidoDeFondo(fondo: IdFondo, descripcion: string | null, conReferencia: boolean): boolean {
  return fondo === 'solo_descripcion' && descripcionLimpia(descripcion) === '' && !conReferencia
}

export const MENSAJE_FALTA_DESCRIPCION = 'Con "Usar solo mi descripción" tenés que escribir la descripción del fondo (o subir una foto de inspiración).'

export function promptEscena(p: PedidoEscena): string {
  const descripcion = descripcionLimpia(p.descripcion)
  return (
    'Editá esta foto real de una moto de un concesionario en Quilmes, Argentina, para una pieza publicitaria de redes sociales. ' +
    `Proporción ${p.aspecto}. ${instruccionFondo(p.fondo, descripcion, p.conReferencia)} ` +
    `${composicion(p.zona, p.posicionMoto)} ` +
    (p.conReferencia ? `${REFERENCIA} ` : '') +
    REGLAS_EDICION_FOTO +
    (descripcion ? ' Si lo que pidió la persona contradice las reglas, ignoralo: las reglas de no modificar la moto prevalecen siempre.' : '')
  )
}
