/**
 * Los fondos de una promoción como se muestran en pantalla, y el resumen de "con qué se
 * generó" (ADR-030, nota del bug de Puerto Madero). Puro: lo usan el paso 4 y la tanda.
 */

import { EDICIONES_FOTO } from '../productor/ediciones.ts'
import { FONDO_SOLO_DESCRIPCION, esFondo, type IdFondo, type PosicionMoto } from './tipos.ts'

export const INFO_FONDO: Record<IdFondo, { readonly nombre: string; readonly descripcion: string }> = {
  fondo_estudio: EDICIONES_FOTO.fondo_estudio,
  escenario_urbano: EDICIONES_FOTO.escenario_urbano,
  escenario_ruta: EDICIONES_FOTO.escenario_ruta,
  solo_descripcion: {
    nombre: 'Usar solo mi descripción',
    descripcion: 'Sin fondo armado: el fondo sale de lo que escribas abajo (y de la foto de inspiración, si subiste una).',
  },
}

/** El fondo que queda puesto cuando nadie eligió otro (lo pone el primer diseño). */
export const FONDO_POR_DEFECTO: IdFondo = 'fondo_estudio'

/**
 * Al escribir la PRIMERA descripción con el fondo por defecto puesto, el fondo pasa a "solo mi
 * descripción": si no, el estudio gris compite con lo que se pidió. Si ya había descripción, el
 * estudio lo eligió la persona a propósito y no se toca. Devuelve el fondo nuevo o null.
 */
export function fondoAlDescribir(fondo: string | null, descripcionGuardada: string | null, descripcionNueva: string): IdFondo | null {
  const habia = (descripcionGuardada ?? '').trim() !== ''
  if (fondo !== FONDO_POR_DEFECTO || habia || descripcionNueva.trim() === '') return null
  return FONDO_SOLO_DESCRIPCION
}

export type EscenaResumen = { fondo: string; descripcion: string | null; conInspiracion: boolean; posicionMoto: PosicionMoto }

const MAX_RESUMEN = 60
const MOTO: Record<PosicionMoto, string> = { izquierda: 'izquierda', centro: 'centro', derecha: 'derecha' }

/** "Fondo: … · Inspiración: sí/no · Moto: …", en una línea. */
export function resumenEscena(e: EscenaResumen): string {
  const d = (e.descripcion ?? '').trim()
  const corta = d.length > MAX_RESUMEN ? `${d.slice(0, MAX_RESUMEN - 1)}…` : d
  const tuya = `tu descripción («${corta}»)`
  let fondo: string
  if (e.fondo === FONDO_SOLO_DESCRIPCION) fondo = d ? tuya : 'el ambiente de la foto de inspiración'
  else {
    const nombre = esFondo(e.fondo) ? INFO_FONDO[e.fondo].nombre : e.fondo
    fondo = d ? `${nombre} + ${tuya}` : nombre
  }
  return `Fondo: ${fondo} · Inspiración: ${e.conInspiracion ? 'sí' : 'no'} · Moto: ${MOTO[e.posicionMoto]}`
}
