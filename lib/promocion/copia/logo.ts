/** ¿La concesionaria tiene un logo que nuestro renderer (satori) pueda dibujar? Si no, la IA escribe su nombre. Puro. */

import { esDibujable, type LogoLeido, type ManifiestoLeido } from '../logos.ts'
import { idRecursoLogo } from '../diseno/recursos-ids.ts'

/** La 999motos siempre (el logo 999 está en el manifiesto); las demás, con un logo de rol concesionaria en PNG o JPG (WebP no lo lee satori). */
export function logoDibujable(m: ManifiestoLeido, marcaId: string): boolean {
  const e = m.marcas[marcaId]
  if (!e) return false
  if (e.es999) return true
  return e.logos.some((l) => l.rol === 'concesionaria' && esDibujable(l))
}

/**
 * Qué logo pega nuestro renderer sobre la imagen: el 999 para la 999motos; para las demás, el de la concesionaria que mejor se ve sobre el
 * fondo que vio el verificador (claro u oscuro; sin dato se asume oscuro), solo entre los que satori sabe dibujar. null = no hay.
 */
export function logoParaPegar(m: ManifiestoLeido, marcaId: string, fondoLogo: 'claro' | 'oscuro' | null): { id: string; placaClara: boolean } | null {
  const e = m.marcas[marcaId]
  if (!e) return null
  if (e.es999) return { id: 'logo999', placaClara: false }
  const fondo = fondoLogo ?? 'oscuro'
  const propios: LogoLeido[] = e.logos.filter((l) => l.rol === 'concesionaria' && esDibujable(l))
  const contrasta = fondo === 'oscuro' ? 'claro' : 'oscuro'
  const elegido = propios.find((l) => l.tono === contrasta) ?? propios.find((l) => l.tono === 'color') ?? propios[0]
  return elegido ? { id: idRecursoLogo(marcaId, elegido.id), placaClara: Boolean(elegido.placaClara && fondo === 'oscuro') } : null
}
