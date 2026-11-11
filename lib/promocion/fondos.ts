/**
 * Los fondos de una promoción como se muestran en pantalla, y el resumen de "con qué se
 * generó" (ADR-030, nota del bug de Puerto Madero). Puro: lo usan el paso 4 y la tanda.
 */

import { esFondoImagen, OPCIONES_FONDO } from '../imagenes/fondos.ts'
import { PLANTILLAS_DISENO } from './diseno/catalogo.ts'
import { esPlantillaDiseno, FONDO_SOLO_DESCRIPCION, type IdFondo, type PosicionMoto } from './tipos.ts'

export const INFO_FONDO: Record<IdFondo, { readonly nombre: string; readonly descripcion: string }> = {
  fondo_estudio: OPCIONES_FONDO.fondo_estudio,
  estudio_oscuro: OPCIONES_FONDO.estudio_oscuro,
  estudio_azul: OPCIONES_FONDO.estudio_azul,
  estudio_crema: OPCIONES_FONDO.estudio_crema,
  escenario_urbano: OPCIONES_FONDO.escenario_urbano,
  escenario_ruta: OPCIONES_FONDO.escenario_ruta,
  solo_formato: OPCIONES_FONDO.solo_formato,
  solo_descripcion: OPCIONES_FONDO.solo_descripcion,
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

export type EscenaResumen = { fondo: string; descripcion: string | null; conInspiracion: boolean; posicionMoto: PosicionMoto | null }

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
    const nombre = esFondoImagen(e.fondo) ? OPCIONES_FONDO[e.fondo].nombre : e.fondo
    fondo = d ? `${nombre} + ${tuya}` : nombre
  }
  return `Fondo: ${fondo} · Inspiración: ${e.conInspiracion ? 'sí' : 'no'}${e.posicionMoto ? ` · Moto: ${MOTO[e.posicionMoto]}` : ''}`
}

type EscenaConFondo = { generacion: { id: string; fondo?: string; ajuste?: { baseCreativoId: string } }; creativos: { id: string }[] }

/**
 * El fondo con el que se generó la imagen elegida. Un cambio pedido (ADR-034) no dice su fondo: se sigue la cadena hasta la
 * imagen original. Null si no se sabe (sin imagen, imagen que ya no está, prompt que no lo dice o cadena que da vueltas).
 */
export function fondoDeLaEscena(creativoId: string | null, escenas: readonly EscenaConFondo[]): string | null {
  let actual = creativoId
  const vistos = new Set<string>()
  while (actual && !vistos.has(actual)) {
    vistos.add(actual)
    const id = actual
    const e = escenas.find((x) => x.creativos.some((c) => c.id === id))
    if (!e) return null
    if (e.generacion.fondo) return e.generacion.fondo
    actual = e.generacion.ajuste?.baseCreativoId ?? null
  }
  return null
}

/** Cada plantilla de diseño tiene su estudio (oscuro, azul, crema). Si la imagen se hizo con otro, se sugiere el suyo; nunca bloquea. */
export function avisoDeFondo(plantilla: string | null, fondoDeLaImagen: string | null): { sugerido: IdFondo; nombre: string } | null {
  if (!plantilla || !esPlantillaDiseno(plantilla) || !fondoDeLaImagen) return null
  const sugerido = PLANTILLAS_DISENO[plantilla].fondoSugerido
  return fondoDeLaImagen === sugerido ? null : { sugerido, nombre: INFO_FONDO[sugerido].nombre }
}
