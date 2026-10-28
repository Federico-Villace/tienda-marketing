/**
 * Paso 0 de /promocionar/nueva (ADR-032): ¿qué querés armar? El valor viaja en la URL (?que=) para
 * que el link funcione y se pueda volver atrás. Lo que no se reconoce vuelve a la pregunta.
 */

export const QUE = ['una', 'motos', 'textos'] as const
export type Que = (typeof QUE)[number]

export function leerQue(x: string | string[] | undefined): Que | null {
  return typeof x === 'string' && (QUE as readonly string[]).includes(x) ? (x as Que) : null
}

/** Las opciones del paso 0, con una leyenda de una línea (el costo aproximado lo agrega la pantalla). */
export const OPCIONES_QUE: readonly { id: Que; titulo: string; leyenda: string }[] = [
  { id: 'una', titulo: 'Una moto', leyenda: 'Una moto con su precio y su promo; una pieza por marca si querés.' },
  { id: 'motos', titulo: 'Varias motos, mismo diseño', leyenda: 'Hasta 10 motos con el mismo diseño: cada moto con su foto y su precio.' },
  { id: 'textos', titulo: 'Varios textos para una moto', leyenda: 'La misma moto con 2 a 5 textos distintos sobre una sola imagen.' },
]
