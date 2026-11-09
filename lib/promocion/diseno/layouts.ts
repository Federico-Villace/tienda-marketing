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
export type LayoutDiseno = { ancho: number; alto: number; cajas: Record<NombreCaja, Caja> }

/** Las cajas que llevan texto (para comprobar que no se pisan). La escena y los logos no cuentan. */
export const cajasDeTexto = (l: LayoutDiseno): [NombreCaja, Caja][] =>
  (['modelo', 'frase', 'precio', 'condicion', 'pie'] as const).map((n) => [n, l.cajas[n]])

const caja = (x: number, y: number, w: number, h: number): Caja => ({ x, y, w, h })
const ANCHO = 1080
const MARGEN = 48
const MARCO_X = MARGEN

/** Espeja una caja respecto del eje vertical del lienzo. */
const espejo = (c: Caja): Caja => ({ ...c, x: ANCHO - c.x - c.w })

type Medidas = { logo: Caja; logoMarca: Caja; modelo: Caja; escenaY: number; escenaH: number; frase: Caja; precio: Caja; condicion: Caja; pie: Caja; logoConcesionaria: Caja }

/** Impactante: logo y modelo arriba, la moto en el centro, frase/precio/condición sobre su parte baja, pie abajo. */
const IMPACTANTE: Record<AspectoFoto, Medidas> = {
  '4:5': {
    logo: caja(MARGEN, 36, 300, 120),
    logoMarca: caja(800, 36, 232, 120),
    modelo: caja(MARGEN, 170, 984, 150),
    escenaY: 320,
    escenaH: 660,
    frase: caja(MARGEN, 860, 520, 150),
    precio: caja(MARGEN, 1030, 560, 130),
    condicion: caja(632, 1030, 400, 130),
    pie: caja(MARGEN, 1182, 984, 68),
    logoConcesionaria: caja(390, 1264, 300, 68),
  },
  '1:1': {
    logo: caja(MARGEN, 30, 240, 96),
    logoMarca: caja(808, 30, 224, 96),
    modelo: caja(MARGEN, 134, 984, 120),
    escenaY: 250,
    escenaH: 500,
    frase: caja(MARGEN, 640, 500, 110),
    precio: caja(MARGEN, 770, 540, 110),
    condicion: caja(612, 770, 420, 110),
    pie: caja(MARGEN, 902, 984, 58),
    logoConcesionaria: caja(390, 976, 300, 64),
  },
  '9:16': {
    logo: caja(MARGEN, 60, 320, 128),
    logoMarca: caja(760, 60, 272, 128),
    modelo: caja(MARGEN, 214, 984, 180),
    escenaY: 380,
    escenaH: 960,
    frase: caja(MARGEN, 1190, 560, 170),
    precio: caja(MARGEN, 1390, 560, 150),
    condicion: caja(632, 1390, 400, 150),
    pie: caja(MARGEN, 1590, 984, 90),
    logoConcesionaria: caja(340, 1730, 400, 100),
  },
}

/** Deportiva: el modelo va sobre un panel blanco inclinado (un poco más alto) y la barra de precio ocupa el ancho de la frase. */
const DEPORTIVA: Record<AspectoFoto, Medidas> = {
  '4:5': { ...IMPACTANTE['4:5'], modelo: caja(MARCO_X, 172, 984, 150), escenaY: 340, escenaH: 640, frase: caja(MARCO_X, 868, 560, 140), precio: caja(MARCO_X, 1030, 600, 130), condicion: caja(676, 1030, 356, 130) },
  '1:1': { ...IMPACTANTE['1:1'], modelo: caja(MARCO_X, 130, 984, 124), escenaY: 262, escenaH: 480, frase: caja(MARCO_X, 640, 540, 110), precio: caja(MARCO_X, 770, 580, 110), condicion: caja(652, 770, 380, 110) },
  '9:16': { ...IMPACTANTE['9:16'], modelo: caja(MARCO_X, 210, 984, 190), escenaY: 400, escenaH: 940, frase: caja(MARCO_X, 1190, 600, 170), precio: caja(MARCO_X, 1390, 600, 150), condicion: caja(676, 1390, 356, 150) },
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
  if (id === 'deportiva') return deMedidas(DEPORTIVA[formato], alto, posicionFrase)
  throw new Error(`La plantilla ${id} todavía no tiene layout.`)
}
