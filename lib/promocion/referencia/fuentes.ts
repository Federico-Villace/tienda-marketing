/**
 * De la categoría de letra que "ve" el modelo de visión a una fuente de la lista CERRADA del rol (FUENTES_POR_ROL):
 * jamás sale un id fuera de lo que la placa sabe medir y dibujar. Puro.
 */

import type { IdFuente } from '../fuentes-placa.ts'
import type { CategoriaFuente } from './tipos.ts'

export type RolFuente = 'modelo' | 'frase' | 'precio' | 'condicion' | 'pie'

const MODELO: Record<CategoriaFuente, IdFuente> = {
  condensada: 'anton',
  gruesa: 'archivo-black',
  expandida: 'archivo-expanded',
  geometrica: 'montserrat',
  tecnica: 'russo-one',
  stencil: 'black-ops-one',
  manuscrita: 'anton',
  pincel: 'anton',
  retro: 'archivo-black',
  comic: 'anton',
  serif: 'sora-extrabold',
}

const FRASE: Record<CategoriaFuente, IdFuente> = {
  condensada: 'oswald',
  gruesa: 'montserrat',
  expandida: 'archivo-expanded',
  geometrica: 'sora-semibold',
  tecnica: 'oswald',
  stencil: 'oswald',
  manuscrita: 'kaushan',
  pincel: 'caveat-brush',
  retro: 'lobster',
  comic: 'bangers',
  serif: 'sora-semibold',
}

const PRECIO: Record<CategoriaFuente, IdFuente> = {
  condensada: 'anton',
  gruesa: 'archivo-black',
  expandida: 'archivo-expanded',
  geometrica: 'montserrat',
  tecnica: 'teko',
  stencil: 'archivo-black',
  manuscrita: 'anton',
  pincel: 'anton',
  retro: 'archivo-black',
  comic: 'anton',
  serif: 'sora-extrabold',
}

const DEFECTO: Record<'modelo' | 'frase' | 'precio', IdFuente> = { modelo: 'anton', frase: 'oswald', precio: 'anton' }

export function fuenteDeCategoria(rol: RolFuente, categoria: CategoriaFuente | null): IdFuente {
  if (rol === 'condicion' || rol === 'pie') return categoria === 'condensada' ? 'barlow-condensed' : 'sora-semibold'
  if (categoria === null) return DEFECTO[rol]
  return { modelo: MODELO, frase: FRASE, precio: PRECIO }[rol][categoria]
}

/** La fuente elegida NO es lo que la referencia tenía (serif, o caligrafía en un rol que va en mayúsculas): se avisa. */
export function esSustitucion(rol: 'modelo' | 'frase' | 'precio', categoria: CategoriaFuente | null): boolean {
  if (categoria === 'serif') return true
  return rol !== 'frase' && (categoria === 'manuscrita' || categoria === 'pincel' || categoria === 'comic')
}
