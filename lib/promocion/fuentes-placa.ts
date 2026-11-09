/**
 * Las fuentes (OFL) de cada plantilla de la placa. Puro: el servidor carga SOLO las de la
 * plantilla (componer.ts) y el navegador las mismas (components/promocion/fuentes.ts).
 * satori no lee woff2 ni fuentes variables: son TTF/OTF estáticos, commiteados en assets/fuentes.
 */

import { esPlantillaDiseno, type IdPlantilla } from './tipos.ts'

export type IdFuente = 'anton' | 'inter' | 'kaushan' | 'barlow-condensed' | 'archivo-expanded' | 'sora-extrabold' | 'sora-semibold'
export const IDS_FUENTE: readonly IdFuente[] = ['anton', 'inter', 'kaushan', 'barlow-condensed', 'archivo-expanded', 'sora-extrabold', 'sora-semibold']

export type FuenteRegistrada = {
  /** Nombre de familia (lo que satori compara con `fontFamily`). */
  readonly familia: string
  readonly archivo: string
  readonly peso: 400 | 600 | 800
  readonly estilo: 'normal' | 'italic'
  /** Archivo de la licencia, en la misma carpeta. */
  readonly licencia: string
}

export const REGISTRO_FUENTES: Record<IdFuente, FuenteRegistrada> = {
  anton: { familia: 'Anton', archivo: 'Anton-Regular.ttf', peso: 400, estilo: 'normal', licencia: 'OFL-Anton.txt' },
  inter: { familia: 'Inter', archivo: 'Inter-SemiBold.otf', peso: 600, estilo: 'normal', licencia: 'OFL-Inter.txt' },
  kaushan: { familia: 'Kaushan Script', archivo: 'KaushanScript-Regular.ttf', peso: 400, estilo: 'normal', licencia: 'OFL-Kaushan.txt' },
  'barlow-condensed': { familia: 'Barlow Condensed', archivo: 'BarlowCondensed-ExtraBoldItalic.ttf', peso: 800, estilo: 'italic', licencia: 'OFL-BarlowCondensed.txt' },
  'archivo-expanded': { familia: 'Archivo Expanded', archivo: 'Archivo_Expanded-ExtraBoldItalic.ttf', peso: 800, estilo: 'italic', licencia: 'OFL-Archivo.txt' },
  'sora-extrabold': { familia: 'Sora', archivo: 'Sora-ExtraBold.ttf', peso: 800, estilo: 'normal', licencia: 'OFL-Sora.txt' },
  'sora-semibold': { familia: 'Sora', archivo: 'Sora-SemiBold.ttf', peso: 600, estilo: 'normal', licencia: 'OFL-Sora.txt' },
}

const DE_DISENO: Record<string, readonly IdFuente[]> = {
  impactante_textura: ['anton', 'kaushan', 'barlow-condensed'],
  deportiva: ['archivo-expanded', 'barlow-condensed'],
  editorial: ['sora-extrabold', 'sora-semibold'],
}

/** Qué fuentes hay que cargar para dibujar esta plantilla. */
export const fuentesDe = (plantilla: IdPlantilla): readonly IdFuente[] => (esPlantillaDiseno(plantilla) ? DE_DISENO[plantilla]! : ['anton', 'inter'])
