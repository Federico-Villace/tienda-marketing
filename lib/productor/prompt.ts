/**
 * Prompt de imagen del Productor. Sale SOLO del brief visual de la pieza
 * aprobada, la marca, el formato y reglas fijas. El hook y el copy no entran.
 * Nunca lleva la clave de Gemini.
 */

import type { Pieza } from '../contenidista/tipos.ts'
import { EDICIONES_FOTO, type IdEdicion } from './ediciones.ts'

/** Cambiar el texto de abajo obliga a subir esta versión. */
export const VERSION_PROMPT_IMAGEN = 'productor-v1'

export type Aspecto = '1:1' | '4:5' | '9:16'

/** null = el formato no es elegible para el Productor (video y reel). */
export function aspectoDe(formato: string, plataforma: string): Aspecto | null {
  if (formato === 'historia') return '9:16'
  if (formato === 'imagen' || formato === 'carrusel') return plataforma === 'facebook' ? '1:1' : '4:5'
  return null
}

export function promptImagen(pieza: Pick<Pieza, 'marca' | 'plataforma' | 'formato' | 'briefVisual'>, aspecto: Aspecto): string {
  return (
    `Fotografía publicitaria realista para ${pieza.plataforma} (${pieza.formato}) de un concesionario de motos ` +
    `${pieza.marca} en Quilmes, Argentina. Proporción ${aspecto}. Escena: ${pieza.briefVisual}. ` +
    'Reglas obligatorias: sin texto, letras, números ni precios dentro de la imagen; ' +
    'sin logos, emblemas ni nombres de marcas (ni reales ni inventados); sin patentes legibles; ' +
    'sin personas reconocibles ni caras en primer plano; sin marcas de agua. ' +
    'Luz natural, colores fieles, composición limpia con espacio libre.'
  )
}

/** Prompt para editar una foto real. Cambiar el texto obliga a subir esta versión. */
export const VERSION_PROMPT_FOTO = 'productor-foto-v1'

/** Lo que NUNCA cambia al editar una foto: la moto. También lo usa el prompt de escena de una promoción. */
export const REGLAS_EDICION_FOTO =
  'Reglas obligatorias: NO modifiques la moto en absoluto: forma, proporciones, color, logos y emblemas de la marca, ' +
  'calcos, ruedas, ópticas y todos sus detalles quedan idénticos. ' +
  'No agregues texto, letras, números, precios, logos nuevos ni marcas de agua. No agregues personas. ' +
  'Luz y sombras coherentes con la escena, aspecto fotográfico realista.'

export function promptFoto(edicion: IdEdicion, aspecto: Aspecto): string {
  return (
    'Editá esta foto real de una moto de un concesionario en Quilmes, Argentina, para redes sociales. ' +
    `Proporción ${aspecto}. ${EDICIONES_FOTO[edicion].instruccion} ` +
    REGLAS_EDICION_FOTO
  )
}
