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
export const OPCIONES_QUE: readonly { id: Que; titulo: string; leyenda: string; ejemplo: string }[] = [
  { id: 'una', titulo: 'Una moto', leyenda: 'Una moto con su precio y su promo; una placa por marca si elegís varias.', ejemplo: 'Ej.: la Rouser 200 a $ 4.200.000 para Zontes y Suzuki.' },
  { id: 'motos', titulo: 'Varias motos, mismo diseño', leyenda: 'Motos distintas, cada una con su foto y su precio: cada moto tiene su propia imagen.', ejemplo: 'Ej.: Rouser 200, Dominar 400 y TRK 502 para un catálogo.' },
  { id: 'textos', titulo: 'Varios textos para una moto', leyenda: 'Una sola imagen y varias placas encima, con precios o promos distintas.', ejemplo: 'Ej.: la Rouser 200 al contado y en 12 cuotas, con el mismo fondo.' },
]
