/**
 * Tamaños de letra de una plantilla de diseño, calculados con la heurística de siempre (ancho medio de
 * un carácter / tamaño, ver plantillas.ts) pero contra las CAJAS del layout. Puro: se testea sin dibujar.
 * Si algo no entra ni en su mínimo se lanza ErrorTextoLargo, igual que en las clásicas.
 */

import type { IdFuente } from '../fuentes-placa.ts'
import type { IdPlantillaDiseno } from '../tipos.ts'
import { ErrorTextoLargo, type Campo, type TextosPlaca } from '../plantillas.ts'
import type { Caja, LayoutDiseno } from './layouts.ts'
import type { DisenoResuelto } from './tipos.ts'

export const PRECIO_OCULTO = 'CONSULTÁ PRECIO'
/** Cada paso de `tamanos` cambia la letra un 8 %. */
export const PASO_TAMANO = 0.08

/** Ancho medio de un carácter / tamaño y alto de línea, por fuente (conservador, como en las clásicas). */
export const METRICAS: Record<IdFuente, { ancho: number; linea: number }> = {
  anton: { ancho: 0.5, linea: 1.15 },
  inter: { ancho: 0.6, linea: 1.25 },
  kaushan: { ancho: 0.5, linea: 1.25 },
  'barlow-condensed': { ancho: 0.45, linea: 1.1 },
  'archivo-expanded': { ancho: 0.74, linea: 1.1 },
  'sora-extrabold': { ancho: 0.64, linea: 1.2 },
  'sora-semibold': { ancho: 0.6, linea: 1.25 },
}

export type Tam = { tam: number; lineas: number }
export type AjusteDiseno = {
  modelo: Tam
  frase: Tam
  /** Lo que se dibuja como precio: el monto formateado o CONSULTÁ PRECIO. */
  textoPrecio: string
  precio: Tam
  /** 0 = no se dibuja, 1 = solo el texto, 2 = texto y destacado. */
  filasCondicion: 0 | 1 | 2
  condicionTam: number
  ctaTam: number
  /** Ancho estimado de la pastilla del CTA (con su relleno). */
  ctaAncho: number
  lugarTam: number
}

/** Qué fuente lleva cada texto en cada plantilla. */
export const FUENTE_DE: Record<IdPlantillaDiseno, { modelo: IdFuente; frase: IdFuente; precio: IdFuente; condicion: IdFuente; pie: IdFuente }> = {
  impactante_textura: { modelo: 'anton', frase: 'kaushan', precio: 'anton', condicion: 'barlow-condensed', pie: 'barlow-condensed' },
  deportiva: { modelo: 'archivo-expanded', frase: 'archivo-expanded', precio: 'archivo-expanded', condicion: 'barlow-condensed', pie: 'barlow-condensed' },
  editorial: { modelo: 'sora-extrabold', frase: 'sora-semibold', precio: 'sora-extrabold', condicion: 'sora-semibold', pie: 'sora-semibold' },
}

type Regla = { fuente: IdFuente; lineas: number; min: number; /** Lo más grande que se pide aunque la caja deje más. */ tope: number; campo: Campo }

/** Letra más grande a la que `texto` entra en `caja`, o null si ni en `min`. */
function mayorQueEntra(texto: string, caja: { w: number; h: number }, r: Regla): Tam | null {
  const n = texto.length
  const m = METRICAS[r.fuente]
  for (let tam = r.tope; tam >= r.min; tam--) {
    const porLinea = Math.max(1, Math.floor(caja.w / (tam * m.ancho)))
    const lineas = Math.ceil(n / porLinea)
    if (lineas <= r.lineas && lineas * tam * m.linea <= caja.h) return { tam, lineas }
  }
  return null
}

/**
 * Tamaño final: el "automático" es la letra cómoda (86 % de lo máximo que la caja admite), para que +1 y +2
 * tengan lugar; `paso` (−2..+2) lo mueve de a 8 % sin pasar nunca de lo que entra en la caja.
 */
function ajustarCampo(texto: string, caja: { w: number; h: number }, r: Regla, paso: number): Tam {
  if (texto.length === 0) return { tam: r.min, lineas: 0 }
  const max = mayorQueEntra(texto, caja, r)
  if (!max) throw new ErrorTextoLargo(r.campo)
  const auto = Math.max(r.min, Math.min(max.tam, Math.floor(r.tope * 0.86)))
  const pedido = Math.round(auto * (1 + PASO_TAMANO * paso))
  const tam = Math.max(r.min, Math.min(pedido, max.tam))
  return mayorQueEntra(texto, caja, { ...r, tope: tam }) ?? max
}

const medida = (c: Caja) => ({ w: c.w, h: c.h })

export function ajustarDiseno(textos: TextosPlaca, d: DisenoResuelto, layout: LayoutDiseno, plantilla: IdPlantillaDiseno = 'impactante_textura'): AjusteDiseno {
  const { cajas } = layout
  const fu = FUENTE_DE[plantilla]
  const modelo = ajustarCampo(textos.modelo.trim(), medida(cajas.modelo), { fuente: fu.modelo, lineas: 2, min: 44, tope: Math.floor(cajas.modelo.h / METRICAS[fu.modelo].linea), campo: 'modelo' }, d.tamanos.modelo)
  const frase = ajustarCampo(d.frase.trim(), medida(cajas.frase), { fuente: fu.frase, lineas: 2, min: 30, tope: Math.floor(cajas.frase.h / (METRICAS[fu.frase].linea * 2)), campo: 'titular' }, d.tamanos.frase)

  const textoPrecio = d.mostrarPrecio ? textos.precio.trim() : PRECIO_OCULTO
  const precio = ajustarCampo(textoPrecio, medida(cajas.precio), { fuente: fu.precio, lineas: 1, min: 36, tope: Math.floor(cajas.precio.h / METRICAS[fu.precio].linea), campo: 'precio' }, d.tamanos.precio)

  // Condición: el texto y, si hay, el destacado en una pastilla debajo; cada uno en una línea.
  const texto = d.condicion.texto.trim()
  const destacado = d.condicion.destacado.trim()
  const filasCondicion = (texto ? (destacado ? 2 : 1) : destacado ? 1 : 0) as 0 | 1 | 2
  let condicionTam = 0
  if (filasCondicion > 0) {
    const fila = { w: cajas.condicion.w, h: cajas.condicion.h / filasCondicion }
    const regla = { fuente: fu.condicion, lineas: 1, min: 24, tope: Math.floor(fila.h / METRICAS[fu.condicion].linea), campo: 'promo' as const }
    // La pastilla lleva relleno a los costados: el texto tiene menos ancho.
    condicionTam = Math.min(...[texto, destacado].filter(Boolean).map((t, i) => ajustarCampo(t, { w: fila.w - (i === 1 || !texto ? 48 : 0), h: fila.h }, regla, 0).tam))
  }

  // Pie: pastilla del CTA a la izquierda y pin + lugar en el resto.
  const pie = cajas.pie
  const ctaTam = Math.min(44, Math.floor(pie.h * 0.5))
  const ctaAncho = Math.ceil(d.cta.length * ctaTam * METRICAS[fu.pie].ancho) + 48
  const restante = pie.w - ctaAncho - 32 - 44 // separación y pin
  const lugar = ajustarCampo(textos.lugar.trim(), { w: restante, h: pie.h }, { fuente: fu.pie, lineas: 1, min: 22, tope: ctaTam, campo: 'lugar' }, 0)

  return { modelo, frase, textoPrecio, precio, filasCondicion, condicionTam, ctaTam, ctaAncho, lugarTam: lugar.tam }
}

/** La frase de la deportiva va en dos colores: se parte por palabras en la mitad (la primera mitad queda con la parte corta). */
export function partirFrase(frase: string): [string, string] {
  const palabras = frase.trim().split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return ['', '']
  if (palabras.length === 1) return [palabras[0]!, '']
  const corte = Math.floor(palabras.length / 2)
  return [palabras.slice(0, corte).join(' '), palabras.slice(corte).join(' ')]
}
