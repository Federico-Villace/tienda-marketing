/**
 * Los fondos que se pueden pedir para una imagen con la foto real de una moto. UNA sola lista
 * para Promociones y /creativos (ADR-034): lo que se ofrece y la frase que entra al prompt
 * salen de acá, así un cambio futuro se hace una vez.
 */

import { EDICIONES_FOTO } from '../productor/ediciones.ts'

export type Seccion = 'promocion' | 'foto'

export const OPCIONES_FONDO = {
  fondo_estudio: EDICIONES_FOTO.fondo_estudio,
  escenario_urbano: EDICIONES_FOTO.escenario_urbano,
  escenario_ruta: EDICIONES_FOTO.escenario_ruta,
  solo_formato: EDICIONES_FOTO.solo_formato,
  solo_descripcion: {
    nombre: 'Usar solo mi descripción',
    descripcion: 'Sin fondo armado: el fondo sale de lo que escribas abajo (y de la foto de inspiración, si subiste una).',
    // Esta opción arma su frase con la descripción o la inspiración (ver instruccionFondo).
    instruccion: '',
  },
  espacio_texto: EDICIONES_FOTO.espacio_texto,
} as const

export type IdFondoImagen = keyof typeof OPCIONES_FONDO

const COMUNES: readonly IdFondoImagen[] = ['fondo_estudio', 'escenario_urbano', 'escenario_ruta', 'solo_formato', 'solo_descripcion']

/** La promoción no ofrece "espacio para texto": la placa ya reserva su zona libre. */
export const fondosPara = (seccion: Seccion): readonly IdFondoImagen[] =>
  seccion === 'foto' ? [...COMUNES, 'espacio_texto'] : COMUNES

/** La frase del fondo: lo que pidió la persona manda; el preset, si hay, queda de base. */
export function instruccionFondo(fondo: IdFondoImagen, descripcion: string, conReferencia: boolean): string {
  if (fondo === 'solo_descripcion') {
    if (descripcion) return `Reemplazá el fondo por el que pidió la persona: «${descripcion}».`
    if (conReferencia) return 'Reemplazá el fondo por uno que recree el ambiente, la luz y la paleta de la SEGUNDA imagen, sin copiar sus objetos.'
    // No debería llegar acá (la estimación lo rechaza antes): un fondo neutro, nunca uno inventado.
    return 'Reemplazá el fondo por uno limpio y neutro.'
  }
  const preset = OPCIONES_FONDO[fondo].instruccion
  if (!descripcion) return preset
  return `Fondo que pidió la persona (manda sobre el fondo base): «${descripcion}». Fondo base, solo en lo que no contradiga ese pedido: ${preset}`
}
