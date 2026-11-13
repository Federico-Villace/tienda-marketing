/**
 * Las fuentes (OFL) de cada plantilla de la placa. Puro: el servidor carga SOLO las de la
 * plantilla (componer.ts) y el navegador las mismas (components/promocion/fuentes.ts).
 * satori no lee woff2 ni fuentes variables: son TTF/OTF estáticos, commiteados en assets/fuentes.
 */

import { esPlantillaDiseno, type IdPlantilla } from './tipos.ts'

export type IdFuente =
  | 'anton'
  | 'inter'
  | 'kaushan'
  | 'barlow-condensed'
  | 'archivo-expanded'
  | 'sora-extrabold'
  | 'sora-semibold'
  | 'bebas-neue'
  | 'oswald'
  | 'archivo-black'
  | 'russo-one'
  | 'teko'
  | 'montserrat'
  | 'black-ops-one'
  | 'caveat-brush'
  | 'pacifico'
  | 'lobster'
  | 'bangers'
export const IDS_FUENTE: readonly IdFuente[] = [
  'anton', 'inter', 'kaushan', 'barlow-condensed', 'archivo-expanded', 'sora-extrabold', 'sora-semibold',
  'bebas-neue', 'oswald', 'archivo-black', 'russo-one', 'teko', 'montserrat', 'black-ops-one', 'caveat-brush', 'pacifico', 'lobster', 'bangers',
]

export type FuenteRegistrada = {
  /** Nombre de familia (lo que satori compara con `fontFamily`). */
  readonly familia: string
  /** Cómo se la nombra en pantalla (el selector de fuentes). */
  readonly nombre: string
  readonly archivo: string
  readonly peso: 400 | 600 | 700 | 800
  readonly estilo: 'normal' | 'italic'
  /** Archivo de la licencia, en la misma carpeta. */
  readonly licencia: string
}

export const REGISTRO_FUENTES: Record<IdFuente, FuenteRegistrada> = {
  anton: { familia: 'Anton', nombre: 'Anton', archivo: 'Anton-Regular.ttf', peso: 400, estilo: 'normal', licencia: 'OFL-Anton.txt' },
  inter: { familia: 'Inter', nombre: 'Inter', archivo: 'Inter-SemiBold.otf', peso: 600, estilo: 'normal', licencia: 'OFL-Inter.txt' },
  kaushan: { familia: 'Kaushan Script', nombre: 'Kaushan Script', archivo: 'KaushanScript-Regular.ttf', peso: 400, estilo: 'normal', licencia: 'OFL-Kaushan.txt' },
  'barlow-condensed': { familia: 'Barlow Condensed', nombre: 'Barlow Condensed', archivo: 'BarlowCondensed-ExtraBoldItalic.ttf', peso: 800, estilo: 'italic', licencia: 'OFL-BarlowCondensed.txt' },
  'archivo-expanded': { familia: 'Archivo Expanded', nombre: 'Archivo Expanded', archivo: 'Archivo_Expanded-ExtraBoldItalic.ttf', peso: 800, estilo: 'italic', licencia: 'OFL-Archivo.txt' },
  'sora-extrabold': { familia: 'Sora', nombre: 'Sora', archivo: 'Sora-ExtraBold.ttf', peso: 800, estilo: 'normal', licencia: 'OFL-Sora.txt' },
  'sora-semibold': { familia: 'Sora', nombre: 'Sora (semi)', archivo: 'Sora-SemiBold.ttf', peso: 600, estilo: 'normal', licencia: 'OFL-Sora.txt' },
  'bebas-neue': { familia: 'Bebas Neue', nombre: 'Bebas Neue', archivo: 'BebasNeue-Regular.ttf', peso: 400, estilo: 'normal', licencia: 'OFL-BebasNeue.txt' },
  oswald: { familia: 'Oswald', nombre: 'Oswald', archivo: 'Oswald-Bold.ttf', peso: 700, estilo: 'normal', licencia: 'OFL-Oswald.txt' },
  'archivo-black': { familia: 'Archivo Black', nombre: 'Archivo Black', archivo: 'ArchivoBlack-Regular.ttf', peso: 400, estilo: 'normal', licencia: 'OFL-ArchivoBlack.txt' },
  'russo-one': { familia: 'Russo One', nombre: 'Russo One', archivo: 'RussoOne-Regular.ttf', peso: 400, estilo: 'normal', licencia: 'OFL-RussoOne.txt' },
  teko: { familia: 'Teko', nombre: 'Teko', archivo: 'Teko-SemiBold.ttf', peso: 600, estilo: 'normal', licencia: 'OFL-Teko.txt' },
  montserrat: { familia: 'Montserrat', nombre: 'Montserrat', archivo: 'Montserrat-ExtraBold.ttf', peso: 800, estilo: 'normal', licencia: 'OFL-Montserrat.txt' },
  'black-ops-one': { familia: 'Black Ops One', nombre: 'Black Ops One', archivo: 'BlackOpsOne-Regular.ttf', peso: 400, estilo: 'normal', licencia: 'OFL-BlackOpsOne.txt' },
  'caveat-brush': { familia: 'Caveat Brush', nombre: 'Caveat Brush', archivo: 'CaveatBrush-Regular.ttf', peso: 400, estilo: 'normal', licencia: 'OFL-CaveatBrush.txt' },
  pacifico: { familia: 'Pacifico', nombre: 'Pacifico', archivo: 'Pacifico-Regular.ttf', peso: 400, estilo: 'normal', licencia: 'OFL-Pacifico.txt' },
  lobster: { familia: 'Lobster', nombre: 'Lobster', archivo: 'Lobster-Regular.ttf', peso: 400, estilo: 'normal', licencia: 'OFL-Lobster.txt' },
  bangers: { familia: 'Bangers', nombre: 'Bangers', archivo: 'Bangers-Regular.ttf', peso: 400, estilo: 'normal', licencia: 'OFL-Bangers.txt' },
}

/** Los tres textos grandes de una placa de diseño, cada uno con su propia fuente, inclinación y tamaño. */
export const ROLES_TEXTO = ['modelo', 'frase', 'precio'] as const
export type RolTexto = (typeof ROLES_TEXTO)[number]

/**
 * Lista CERRADA de fuentes que se pueden elegir para cada texto (ADR-038, addendum de fuentes). No es "todo Google Fonts":
 * cada una está medida (ajuste.ts) para garantizar que entra en su caja, tiene ñ, tildes, ¿¡ y $, y existe como TTF estático
 * (satori no lee WOFF2 ni fuentes variables). El modelo y el precio van en mayúsculas: las de la frase tienen minúsculas.
 */
export const FUENTES_POR_ROL: Record<RolTexto, readonly IdFuente[]> = {
  modelo: ['anton', 'bebas-neue', 'oswald', 'archivo-black', 'russo-one', 'teko', 'montserrat', 'black-ops-one', 'barlow-condensed', 'archivo-expanded', 'sora-extrabold'],
  frase: ['kaushan', 'caveat-brush', 'pacifico', 'lobster', 'bangers', 'oswald', 'montserrat', 'archivo-expanded', 'sora-semibold'],
  precio: ['anton', 'bebas-neue', 'oswald', 'archivo-black', 'montserrat', 'teko', 'barlow-condensed', 'archivo-expanded', 'sora-extrabold'],
}

/** Las de trazo manuscrito: en la deportiva y la editorial (que escriben la frase en mayúsculas) se dejan en minúsculas, que es como se lee su caligrafía. */
const DE_GUION: ReadonlySet<IdFuente> = new Set<IdFuente>(['kaushan', 'caveat-brush', 'pacifico', 'lobster'])
export const esFuenteDeGuion = (id: IdFuente): boolean => DE_GUION.has(id)

/** La fuente con que cada plantilla dibuja cada texto si nadie elige otra (lo que había antes de poder elegir). */
export const FUENTE_POR_DEFECTO: Record<string, Record<RolTexto, IdFuente>> = {
  impactante_textura: { modelo: 'anton', frase: 'kaushan', precio: 'anton' },
  deportiva: { modelo: 'archivo-expanded', frase: 'archivo-expanded', precio: 'archivo-expanded' },
  editorial: { modelo: 'sora-extrabold', frase: 'sora-semibold', precio: 'sora-extrabold' },
}

const DE_DISENO: Record<string, readonly IdFuente[]> = {
  impactante_textura: ['anton', 'kaushan', 'barlow-condensed'],
  deportiva: ['archivo-expanded', 'barlow-condensed'],
  editorial: ['sora-extrabold', 'sora-semibold'],
}

/** Qué fuentes hay que cargar para dibujar esta plantilla (más las que se eligieron para sus textos, si no son las de siempre). */
export function fuentesDe(plantilla: IdPlantilla, elegidas: Partial<Record<RolTexto, IdFuente>> = {}): readonly IdFuente[] {
  if (!esPlantillaDiseno(plantilla)) return ['anton', 'inter']
  return [...new Set([...DE_DISENO[plantilla]!, ...Object.values(elegidas)])]
}
