/** ¿La concesionaria tiene un logo que nuestro renderer (satori) pueda dibujar? Si no, la IA escribe su nombre. Puro. */

import { esDibujable, type ManifiestoLeido } from '../logos.ts'

/** La 999motos siempre (el logo 999 está en el manifiesto); las demás, con un logo de rol concesionaria en PNG o JPG (WebP no lo lee satori). */
export function logoDibujable(m: ManifiestoLeido, marcaId: string): boolean {
  const e = m.marcas[marcaId]
  if (!e) return false
  if (e.es999) return true
  return e.logos.some((l) => l.rol === 'concesionaria' && esDibujable(l))
}
