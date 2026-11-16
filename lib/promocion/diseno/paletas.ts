/** Colores de las plantillas de diseño. Hex fijos: el navegador y satori dibujan lo mismo. */

import type { IdPlantillaDiseno } from '../tipos.ts'
import type { Acento } from './tipos.ts'

export type ColorAcento = { readonly hex: string; readonly nombre: string; /** Color de la letra que va SOBRE el acento (contraste). */ readonly sobre: string }

export const BASE: Record<IdPlantillaDiseno, { readonly fondo: string; readonly texto: string; readonly tono: 'oscuro' | 'claro' }> = {
  impactante_textura: { fondo: '#0B0B0D', texto: '#FFFFFF', tono: 'oscuro' },
  deportiva: { fondo: '#1530C8', texto: '#FFFFFF', tono: 'oscuro' },
  editorial: { fondo: '#F3EBDD', texto: '#0B0B0D', tono: 'claro' },
  /** Estático: el fondo y el tono reales salen de la plantilla leída (referencia/acento.ts: tonoDeReferencia). */
  referencia: { fondo: '#0B0B0D', texto: '#FFFFFF', tono: 'oscuro' },
}

export const NEGRO = '#0B0B0D'
export const BLANCO = '#FFFFFF'

/** El primero de cada lista es el acento por defecto. */
const CINCO_ACENTOS: Partial<Record<Acento, ColorAcento>> = {
  azul: { hex: '#2F6BFF', nombre: 'Azul', sobre: BLANCO },
  verde: { hex: '#22C55E', nombre: 'Verde', sobre: NEGRO },
  rojo: { hex: '#E11D2E', nombre: 'Rojo', sobre: BLANCO },
  naranja: { hex: '#FF6B00', nombre: 'Naranja', sobre: NEGRO },
  amarillo: { hex: '#FACC15', nombre: 'Amarillo', sobre: NEGRO },
}

export const ACENTOS_DE: Record<IdPlantillaDiseno, Partial<Record<Acento, ColorAcento>>> = {
  impactante_textura: CINCO_ACENTOS,
  deportiva: {
    amarillo: { hex: '#E4FF1A', nombre: 'Amarillo flúor', sobre: NEGRO },
    verde: { hex: '#7CFF2B', nombre: 'Verde flúor', sobre: NEGRO },
    naranja: { hex: '#FF8A00', nombre: 'Naranja', sobre: NEGRO },
  },
  editorial: {
    naranja: { hex: '#F26A21', nombre: 'Naranja', sobre: BLANCO },
    rojo: { hex: '#D62839', nombre: 'Rojo', sobre: BLANCO },
    azul: { hex: '#2F5BEA', nombre: 'Azul', sobre: BLANCO },
  },
  // 'original' (el primero = el de por defecto) es un marcador: su color es el leído de la foto (colorAcentoReferencia).
  referencia: { original: { hex: '#2F6BFF', nombre: 'Original', sobre: BLANCO }, ...CINCO_ACENTOS },
}

export const acentosDe = (p: IdPlantillaDiseno): Acento[] => Object.keys(ACENTOS_DE[p]) as Acento[]
export const acentoPorDefecto = (p: IdPlantillaDiseno): Acento => acentosDe(p)[0]!
export const colorDe = (p: IdPlantillaDiseno, a: Acento): ColorAcento => ACENTOS_DE[p][a] ?? ACENTOS_DE[p][acentoPorDefecto(p)]!
