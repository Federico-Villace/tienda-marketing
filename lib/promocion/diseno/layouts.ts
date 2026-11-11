/**
 * Cajas absolutas (px sobre 1080 de ancho) de cada bloque de una plantilla de diseño, por formato.
 * Son DATOS, no JSX: se testean sin dibujar (cajas dentro del lienzo, la escena ocupa lo que tiene que
 * ocupar, ningún texto pisa a otro). El layout de 9:16 y de 1:1 NO es un escalado del 4:5: cada uno
 * recoloca los bloques, porque la escena (la moto) se genera una sola vez y se re-encuadra gratis.
 */

import type { AspectoFoto } from '../../productor/ediciones.ts'
import { MEDIDAS } from '../plantillas.ts'
import type { IdPlantillaDiseno } from '../tipos.ts'
import type { PosicionFrase } from './tipos.ts'

export type Caja = { x: number; y: number; w: number; h: number }

export type NombreCaja = 'logo999' | 'logoMarca' | 'modelo' | 'escena' | 'frase' | 'precio' | 'condicion' | 'pie' | 'logoConcesionaria'
/** Solo la editorial: el número gigante detrás de la moto, el círculo de acento, la lista lateral y la banda inclinada. */
export type CajasEditorial = { numero: Caja; circulo: Caja; lista: Caja; banda: Caja }
export type LayoutDiseno = { ancho: number; alto: number; cajas: Record<NombreCaja, Caja> & Partial<CajasEditorial> }

/** Las cajas que llevan texto (para comprobar que no se pisan). La escena y los logos no cuentan. */
export const cajasDeTexto = (l: LayoutDiseno): [string, Caja][] => [
  ...(['modelo', 'frase', 'precio', 'condicion', 'pie'] as const).map((n): [string, Caja] => [n, l.cajas[n]]),
  ...(l.cajas.lista ? [['lista', l.cajas.lista] as [string, Caja]] : []),
]

const caja = (x: number, y: number, w: number, h: number): Caja => ({ x, y, w, h })
const ANCHO = 1080
const MARGEN = 48
const MARCO_X = MARGEN

/** Espeja una caja respecto del eje vertical del lienzo. */
const espejo = (c: Caja): Caja => ({ ...c, x: ANCHO - c.x - c.w })

type Medidas = { logo: Caja; logoMarca: Caja; modelo: Caja; escenaY: number; escenaH: number; frase: Caja; precio: Caja; condicion: Caja; pie: Caja; logoConcesionaria: Caja }

/**
 * La franja donde va la moto dentro de su caja de escena (la parte de en medio: arriba y abajo la escena se funde con el fondo).
 * Ningún texto grande cae sobre ella: es lo que hacía ilegible la frase (azul sobre la rueda).
 */
export const FRANJA_MOTO = { desde: 0.18, hasta: 0.85 } as const
export const bandaMoto = (l: LayoutDiseno): Caja => {
  const e = l.cajas.escena
  return caja(e.x, Math.round(e.y + e.h * FRANJA_MOTO.desde), e.w, Math.round(e.h * (FRANJA_MOTO.hasta - FRANJA_MOTO.desde)))
}

/**
 * Impactante (como la referencia): logo arriba, el modelo GIGANTE a todo el ancho, la frase inclinada sobre el hueco que deja
 * la moto arriba a la izquierda, la moto, el precio solo y enorme, la condición en una fila y el pie. Cada formato recoloca.
 */
const IMPACTANTE: Record<AspectoFoto, Medidas> = {
  '4:5': {
    logo: caja(MARGEN, 24, 300, 106),
    logoMarca: caja(800, 28, 232, 96),
    modelo: caja(MARGEN, 132, 984, 290),
    escenaY: 478,
    escenaH: 620,
    frase: caja(MARGEN, 422, 600, 164),
    precio: caja(MARGEN, 1008, 984, 150),
    condicion: caja(MARGEN, 1162, 984, 52),
    pie: caja(MARGEN, 1222, 984, 60),
    logoConcesionaria: caja(390, 1288, 300, 54),
  },
  '1:1': {
    logo: caja(MARGEN, 22, 240, 78),
    logoMarca: caja(808, 22, 224, 78),
    modelo: caja(MARGEN, 102, 984, 190),
    escenaY: 310,
    escenaH: 480,
    frase: caja(MARGEN, 292, 520, 100),
    precio: caja(MARGEN, 726, 984, 120),
    condicion: caja(MARGEN, 852, 984, 50),
    pie: caja(MARGEN, 912, 984, 58),
    logoConcesionaria: caja(390, 982, 300, 58),
  },
  '9:16': {
    logo: caja(MARGEN, 60, 320, 128),
    logoMarca: caja(760, 60, 272, 128),
    modelo: caja(MARGEN, 196, 984, 360),
    escenaY: 590,
    escenaH: 900,
    frase: caja(MARGEN, 556, 600, 190),
    precio: caja(MARGEN, 1360, 984, 195),
    condicion: caja(MARGEN, 1560, 984, 72),
    pie: caja(MARGEN, 1645, 984, 86),
    logoConcesionaria: caja(340, 1752, 400, 96),
  },
}

/** Las medidas de la primera versión de Impactante: la deportiva las usa de base hasta que se rediseña. */
const BASE_ANTERIOR: Record<AspectoFoto, Medidas> = {
  '4:5': {
    logo: caja(MARGEN, 36, 300, 120), logoMarca: caja(800, 36, 232, 120), modelo: caja(MARGEN, 170, 984, 150), escenaY: 320, escenaH: 660,
    frase: caja(MARGEN, 860, 520, 150), precio: caja(MARGEN, 1030, 560, 130), condicion: caja(632, 1030, 400, 130), pie: caja(MARGEN, 1182, 984, 68), logoConcesionaria: caja(390, 1264, 300, 68),
  },
  '1:1': {
    logo: caja(MARGEN, 30, 240, 96), logoMarca: caja(808, 30, 224, 96), modelo: caja(MARGEN, 134, 984, 120), escenaY: 250, escenaH: 500,
    frase: caja(MARGEN, 640, 500, 110), precio: caja(MARGEN, 770, 540, 110), condicion: caja(612, 770, 420, 110), pie: caja(MARGEN, 902, 984, 58), logoConcesionaria: caja(390, 976, 300, 64),
  },
  '9:16': {
    logo: caja(MARGEN, 60, 320, 128), logoMarca: caja(760, 60, 272, 128), modelo: caja(MARGEN, 214, 984, 180), escenaY: 380, escenaH: 960,
    frase: caja(MARGEN, 1190, 560, 170), precio: caja(MARGEN, 1390, 560, 150), condicion: caja(632, 1390, 400, 150), pie: caja(MARGEN, 1590, 984, 90), logoConcesionaria: caja(340, 1730, 400, 100),
  },
}

/** Deportiva: el modelo va sobre un panel blanco inclinado (un poco más alto) y la barra de precio ocupa el ancho de la frase. */
const DEPORTIVA: Record<AspectoFoto, Medidas> = {
  '4:5': { ...BASE_ANTERIOR['4:5'], modelo: caja(MARCO_X, 172, 984, 150), escenaY: 340, escenaH: 640, frase: caja(MARCO_X, 868, 560, 140), precio: caja(MARCO_X, 1030, 600, 130), condicion: caja(676, 1030, 356, 130) },
  '1:1': { ...BASE_ANTERIOR['1:1'], modelo: caja(MARCO_X, 130, 984, 124), escenaY: 262, escenaH: 480, frase: caja(MARCO_X, 640, 540, 110), precio: caja(MARCO_X, 770, 580, 110), condicion: caja(652, 770, 380, 110) },
  '9:16': { ...BASE_ANTERIOR['9:16'], modelo: caja(MARCO_X, 210, 984, 190), escenaY: 400, escenaH: 940, frase: caja(MARCO_X, 1190, 600, 170), precio: caja(MARCO_X, 1390, 600, 150), condicion: caja(676, 1390, 356, 150) },
}

/** Editorial (el número es más ancho que el círculo: asoman sus costados): marca y modelo arriba, la moto sobre un círculo con el número gigante detrás, y una banda negra con el precio abajo. */
type MedidasEditorial = Medidas & CajasEditorial
const EDITORIAL: Record<AspectoFoto, MedidasEditorial> = {
  '4:5': {
    logo: caja(MARGEN, 36, 240, 96), logoMarca: caja(808, 36, 224, 96), modelo: caja(MARGEN, 140, 984, 130), escenaY: 360, escenaH: 620,
    frase: caja(MARGEN, 930, 984, 80), precio: caja(60, 1040, 540, 110), condicion: caja(620, 1035, 410, 120), pie: caja(60, 1170, 960, 60), logoConcesionaria: caja(390, 1262, 300, 72),
    numero: caja(40, 245, 1000, 480), circulo: caja(190, 262, 700, 700), lista: caja(36, 480, 170, 300), banda: caja(0, 1020, 1080, 230),
  },
  '1:1': {
    logo: caja(MARGEN, 28, 200, 80), logoMarca: caja(832, 28, 200, 80), modelo: caja(MARGEN, 112, 984, 100), escenaY: 290, escenaH: 470,
    frase: caja(MARGEN, 708, 984, 60), precio: caja(60, 796, 520, 90), condicion: caja(610, 792, 420, 100), pie: caja(60, 904, 960, 52), logoConcesionaria: caja(390, 992, 300, 60),
    numero: caja(40, 170, 1000, 400), circulo: caja(240, 190, 600, 600), lista: caja(36, 400, 160, 240), banda: caja(0, 780, 1080, 200),
  },
  '9:16': {
    logo: caja(MARGEN, 56, 300, 120), logoMarca: caja(732, 56, 300, 120), modelo: caja(MARGEN, 200, 984, 170), escenaY: 440, escenaH: 900,
    frase: caja(MARGEN, 1310, 984, 110), precio: caja(60, 1480, 540, 140), condicion: caja(620, 1475, 410, 160), pie: caja(60, 1650, 960, 80), logoConcesionaria: caja(340, 1780, 400, 100),
    numero: caja(40, 300, 1000, 500), circulo: caja(130, 340, 820, 820), lista: caja(36, 680, 180, 420), banda: caja(0, 1450, 1080, 300),
  },
}

function deMedidas(m: Medidas, alto: number, posicionFrase: PosicionFrase): LayoutDiseno {
  // A la derecha la frase y el precio pasan al otro lado; la condición queda del lado opuesto.
  const der = posicionFrase === 'derecha'
  return {
    ancho: ANCHO,
    alto,
    cajas: {
      logo999: m.logo,
      logoMarca: m.logoMarca,
      modelo: m.modelo,
      escena: caja(0, m.escenaY, ANCHO, m.escenaH),
      frase: der ? espejo(m.frase) : m.frase,
      precio: der ? espejo(m.precio) : m.precio,
      condicion: der ? espejo(m.condicion) : m.condicion,
      pie: m.pie,
      logoConcesionaria: m.logoConcesionaria,
    },
  }
}

export function layoutDiseno(id: IdPlantillaDiseno, formato: AspectoFoto, posicionFrase: PosicionFrase = 'izquierda'): LayoutDiseno {
  const alto = MEDIDAS[formato][1]
  if (id === 'impactante_textura') return deMedidas(IMPACTANTE[formato], alto, posicionFrase)
  if (id === 'editorial') {
    const e = EDITORIAL[formato]
    const l = deMedidas(e, alto, 'izquierda')
    return { ...l, cajas: { ...l.cajas, numero: e.numero, circulo: e.circulo, lista: e.lista, banda: e.banda } }
  }
  if (id === 'deportiva') return deMedidas(DEPORTIVA[formato], alto, posicionFrase)
  return deMedidas(IMPACTANTE[formato], alto, posicionFrase)
}
