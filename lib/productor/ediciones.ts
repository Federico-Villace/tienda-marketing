/**
 * Menú fijo de ediciones sobre una foto real de una moto. Es fijo a propósito:
 * no hay análisis de visión previo, porque gastaría antes del click (regla #3).
 */

import { estimarImagenes } from './precios.ts'

export type EdicionFoto = {
  readonly nombre: string
  readonly descripcion: string
  /** Frase que entra al prompt (lib/productor/prompt.ts). */
  readonly instruccion: string
}

export const EDICIONES_FOTO = {
  fondo_estudio: {
    nombre: 'Fondo de estudio',
    descripcion: 'Fondo liso gris claro con sombra suave, como una foto de catálogo.',
    instruccion:
      'Reemplazá el fondo por un estudio fotográfico de fondo liso gris claro, con piso continuo y sombra suave bajo la moto.',
  },
  // Los tres estudios de las plantillas de diseño (ADR-038): el fondo liso es parte del diseño y la placa lo completa.
  estudio_oscuro: {
    nombre: 'Estudio oscuro',
    descripcion: 'Fondo casi negro con textura sutil de cemento y luz lateral dramática.',
    instruccion:
      'Reemplazá el fondo por un estudio fotográfico de fondo liso casi negro con textura sutil de cemento y luz lateral dramática, con piso continuo y sombra suave bajo la moto.',
  },
  estudio_azul: {
    nombre: 'Estudio azul',
    descripcion: 'Fondo azul intenso con un degradé suave.',
    instruccion:
      'Reemplazá el fondo por un estudio fotográfico de fondo liso azul intenso saturado con degradé suave, con piso continuo y sombra suave bajo la moto.',
  },
  estudio_crema: {
    nombre: 'Estudio crema',
    descripcion: 'Fondo crema cálido claro, con piso continuo y sombra suave.',
    instruccion:
      'Reemplazá el fondo por un estudio fotográfico de fondo liso crema cálido claro, piso continuo, sombra suave bajo la moto.',
  },
  escenario_urbano: {
    nombre: 'Escenario urbano',
    descripcion: 'La moto en una calle del conurbano, de día.',
    instruccion:
      'Ubicá la moto en una calle urbana del conurbano bonaerense de día, con veredas y frentes desenfocados.',
  },
  escenario_ruta: {
    nombre: 'Ruta abierta',
    descripcion: 'La moto en una ruta con campo y luz de la tarde.',
    instruccion:
      'Ubicá la moto en una ruta abierta con paisaje de campo y cielo despejado, luz de la tarde.',
  },
  espacio_texto: {
    nombre: 'Espacio para texto',
    descripcion: 'Mantiene el fondo y deja una zona libre arriba para escribir después.',
    instruccion:
      'Mantené el fondo y extendé o despejá una zona libre amplia arriba de la imagen para poner texto después; no escribas nada.',
  },
  solo_formato: {
    nombre: 'Mantener el fondo de la foto',
    descripcion: 'No cambia el fondo: completa la escena para la proporción elegida.',
    instruccion:
      'No cambies el fondo: extendé la escena de forma natural para completar la proporción pedida.',
  },
} as const satisfies Record<string, EdicionFoto>

export type IdEdicion = keyof typeof EDICIONES_FOTO

export const ASPECTOS_FOTO = {
  '1:1': 'Feed cuadrado',
  '4:5': 'Feed vertical',
  '9:16': 'Historia',
} as const

export type AspectoFoto = keyof typeof ASPECTOS_FOTO

export const esEdicion = (id: unknown): id is IdEdicion => typeof id === 'string' && Object.hasOwn(EDICIONES_FOTO, id)

export const esAspectoFoto = (a: unknown): a is AspectoFoto => typeof a === 'string' && Object.hasOwn(ASPECTOS_FOTO, a)

export type ItemMenuFoto = {
  readonly edicion: IdEdicion
  readonly nombre: string
  readonly descripcion: string
  /** Tope por imagen (con la foto de entrada presupuestada). */
  readonly porImagenUsd: number
  readonly topeTotalUsd: number
}

export function menuConPrecios(motor: string, cantidad: number): ItemMenuFoto[] {
  const e = estimarImagenes(motor, cantidad, { conFoto: true })
  return (Object.keys(EDICIONES_FOTO) as IdEdicion[]).map((edicion) => ({
    edicion,
    nombre: EDICIONES_FOTO[edicion].nombre,
    descripcion: EDICIONES_FOTO[edicion].descripcion,
    porImagenUsd: e.topePorImagenUsd,
    topeTotalUsd: e.topeTotalUsd,
  }))
}
