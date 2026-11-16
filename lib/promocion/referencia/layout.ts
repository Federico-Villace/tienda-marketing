/**
 * Layout elástico de la plantilla "referencia": de las cajas leídas (en el alto de la foto de referencia) a las cajas de
 * un formato (4:5, 1:1, 9:16). Puro, sin dibujar: se testea con números.
 *
 * Tres bandas con UN solo mapa vertical creciente (por eso nunca crea un solape que no estuviera): lo que está entero
 * arriba de la moto queda anclado arriba (mismos px), lo que está entero abajo queda anclado abajo, y la banda del medio
 * (la moto y lo que hay a su costado) absorbe la diferencia de alto. Si esa banda queda por debajo del 30 % del lienzo se
 * comprimen arriba y abajo hasta devolverle el 30 %. Después cada zona se re-acomoda (mínimos, margen, sin pisar la moto) y,
 * si una obligatoria no entra, lanza ErrorFormatoReferencia (que es un ErrorTextoLargo: los otros formatos siguen).
 * Convención: una caja de ancho y alto 0 es "no se dibuja".
 */

import type { AspectoFoto } from '../../productor/ediciones.ts'
import type { Alineacion } from '../diseno/ajuste.ts'
import type { Caja, LayoutDiseno } from '../diseno/layouts.ts'
import type { IdFuente } from '../fuentes-placa.ts'
import { ErrorTextoLargo, MEDIDAS } from '../plantillas.ts'
import { acomodar, dentroDe, interseca } from './geometria.ts'
import { ANCHO_REF, MARGEN_X, MARGEN_Y, MINIMOS } from './reparar.ts'
import type { CajaPx, EstiloPrecio, PlantillaReferencia } from './tipos.ts'

/** 0 = tal cual, 1 = espejo horizontal. */
export const VARIACIONES_REFERENCIA = 2
export const MENSAJE_FORMATO_NO_ENTRA = 'Este formato no entra con el diseño de tu referencia.'
/** La banda del medio nunca baja de esta fracción del alto. */
const MEDIO_MIN = 0.3
/** Proporción ancho/alto mínima de la caja de la moto: más angosta, el recorte "cover" le corta los costados a la escena. */
const MOTO_ASPECTO_MIN = 0.6
/** Lo que se pide cuando hay que inventar un logo en una esquina libre. */
const LOGO_ESQUINA = { w: 200, h: 80 }

export class ErrorFormatoReferencia extends ErrorTextoLargo {
  constructor(campo: 'modelo' | 'precio') {
    super(campo)
    this.message = MENSAJE_FORMATO_NO_ENTRA
  }
}

export type CtxLayoutReferencia = {
  /** La promoción tiene condición para dibujar (por defecto sí). */
  condicion?: boolean
  /** Se dibuja el pie con el CTA (por defecto sí). */
  cta?: boolean
  /** La persona eligió un logo de marca de moto (por defecto no). */
  logoMarca?: boolean
}

export type LayoutReferencia = LayoutDiseno & {
  alineaciones: Record<'modelo' | 'frase' | 'precio' | 'condicion', Alineacion>
  estilos: { precio: EstiloPrecio }
  /** Fuentes de la condición y del pie (no son de las elegibles). */
  fuentes: { condicion: IdFuente; pie: IdFuente }
}

export const esLayoutReferencia = (l: LayoutDiseno): l is LayoutReferencia => 'alineaciones' in l && 'estilos' in l && 'fuentes' in l

const VACIA: Caja = { x: 0, y: 0, w: 0, h: 0 }
const ESPEJO: Record<Alineacion, Alineacion> = { izquierda: 'derecha', derecha: 'izquierda', centro: 'centro' }

type Mapa = (y: number) => number

/** El mapa vertical de tres bandas (ver arriba). */
function mapaVertical(todas: readonly CajaPx[], moto: CajaPx, altoRef: number, altoNuevo: number): Mapa {
  const arriba = todas.filter((c) => c.y + c.h <= moto.y).map((c) => c.y + c.h)
  const abajo = todas.filter((c) => c.y >= moto.y + moto.h).map((c) => c.y)
  const A = Math.max(0, ...arriba)
  const B = Math.min(altoRef, ...abajo)
  const Hb = altoRef - B
  const medio = B - A + (altoNuevo - altoRef)
  const k = medio < altoNuevo * MEDIO_MIN ? Math.min(1, (altoNuevo * (1 - MEDIO_MIN)) / (A + Hb)) : 1
  const s = (altoNuevo - k * (A + Hb)) / (B - A)
  return (y) => (y <= A ? y * k : y >= B ? altoNuevo - (altoRef - y) * k : A * k + (y - A) * s)
}

const mapear = (c: CajaPx, f: Mapa): CajaPx => {
  const y1 = Math.round(f(c.y))
  const y2 = Math.round(f(c.y + c.h))
  return { x: c.x, y: y1, w: c.w, h: y2 - y1 }
}

const espejar = (c: CajaPx): CajaPx => ({ ...c, x: ANCHO_REF - c.x - c.w })

export function layoutReferencia(p: PlantillaReferencia, formato: AspectoFoto, variacion = 0, ctx: CtxLayoutReferencia = {}): LayoutReferencia {
  const { condicion: quiereCondicion = true, cta: quiereCta = true, logoMarca: quiereMarca = false } = ctx
  const v = variacion === 1 ? 1 : 0
  const H = MEDIDAS[formato][1]
  const W = ANCHO_REF

  // 1. En coordenadas de la referencia: si la promo tiene condición y la referencia no la traía, se parte la caja del precio 65/35 (si entra).
  let precio = p.precio.caja
  let condicion: CajaPx | null = p.condicion?.caja ?? null
  if (quiereCondicion && !condicion) {
    const h1 = Math.round(precio.h * 0.65)
    const h2 = precio.h - h1
    if (h1 >= MINIMOS.precio.h && h2 >= MINIMOS.condicion.h && precio.w >= MINIMOS.condicion.w) {
      condicion = { x: precio.x, y: precio.y + h1, w: precio.w, h: h2 }
      precio = { ...precio, h: h1 }
    }
  }
  if (!quiereCondicion) condicion = null

  // 2. Mapa vertical y mapeo de cada zona.
  const zonas = {
    modelo: p.modelo.caja,
    precio,
    condicion,
    frase: p.frase?.caja ?? null,
    cta: quiereCta ? (p.cta?.caja ?? null) : null,
  }
  const logosRef = p.logos
  const todas = [zonas.modelo, zonas.precio, ...(zonas.condicion ? [zonas.condicion] : []), ...(zonas.frase ? [zonas.frase] : []), ...(zonas.cta ? [zonas.cta] : []), ...logosRef]
  const f = mapaVertical(todas, p.moto, p.alto, H)
  const adonde = (c: CajaPx): CajaPx => {
    const m = mapear(c, f)
    return v === 1 ? espejar(m) : m
  }

  // La moto: mismo mapa y, si quedó demasiado angosta para su alto, se achica el alto centrado en la banda.
  let moto = mapear(p.moto, f)
  if (moto.w / moto.h < MOTO_ASPECTO_MIN) {
    const h = Math.floor(moto.w / MOTO_ASPECTO_MIN)
    moto = { ...moto, y: moto.y + Math.round((moto.h - h) / 2), h }
  }
  if (v === 1) moto = espejar(moto)

  // 3. Re-acomodar por prioridad: precio > modelo > condición > frase > CTA > logos.
  const limites: CajaPx = { x: MARGEN_X, y: MARGEN_Y, w: W - 2 * MARGEN_X, h: H - 2 * MARGEN_Y }
  const colocadas: CajaPx[] = [moto]
  const poner = (c: CajaPx, min: { w: number; h: number }): CajaPx | null => {
    const r = acomodar(c, min, colocadas, limites)
    if (r) colocadas.push(r)
    return r
  }
  const libre = (c: CajaPx): boolean => dentroDe(c, limites) && !colocadas.some((o) => interseca(c, o))
  const hueco = (candidatas: readonly CajaPx[]): CajaPx | null => {
    const c = candidatas.find(libre)
    if (c) colocadas.push(c)
    return c ?? null
  }

  const cajaPrecio = poner(adonde(zonas.precio), MINIMOS.precio)
  if (!cajaPrecio) throw new ErrorFormatoReferencia('precio')
  const cajaModelo = poner(adonde(zonas.modelo), MINIMOS.modelo)
  if (!cajaModelo) throw new ErrorFormatoReferencia('modelo')
  let cajaCondicion = zonas.condicion ? poner(adonde(zonas.condicion), MINIMOS.condicion) : null
  const cajaFrase = zonas.frase ? poner(adonde(zonas.frase), MINIMOS.frase) : null
  let cajaCta = zonas.cta ? poner(adonde(zonas.cta), MINIMOS.cta) : null
  const logos: CajaPx[] = []
  for (const l of logosRef) {
    const c = poner(adonde(l), MINIMOS.logo)
    if (c) logos.push(c)
  }

  // 4. Lo que la referencia no traía (o no entró): un hueco libre o nada. Nunca se pisa.
  if (quiereCondicion && !cajaCondicion) {
    const { x, w } = cajaPrecio
    const h = MINIMOS.condicion.h
    cajaCondicion = hueco([{ x, y: cajaPrecio.y + cajaPrecio.h + 8, w: Math.max(w, MINIMOS.condicion.w), h }, { x, y: cajaPrecio.y - h - 8, w: Math.max(w, MINIMOS.condicion.w), h }])
  }
  if (quiereCta && !cajaCta) {
    const { w, h } = MINIMOS.cta
    const y = limites.y + limites.h - h
    cajaCta = hueco([{ x: limites.x, y, w, h }, { x: limites.x + limites.w - w, y, w, h }])
  }
  const esquinas = (t: { w: number; h: number }): CajaPx[] => [
    { x: limites.x, y: limites.y, ...t },
    { x: limites.x + limites.w - t.w, y: limites.y, ...t },
    { x: limites.x, y: limites.y + limites.h - t.h, ...t },
    { x: limites.x + limites.w - t.w, y: limites.y + limites.h - t.h, ...t },
  ]
  const faltan = Math.max(0, 2 - logos.length)
  for (let i = 0; i < faltan; i++) {
    const c = hueco(esquinas(LOGO_ESQUINA))
    if (c) logos.push(c)
  }
  const cajaMarca = quiereMarca ? hueco(esquinas(LOGO_ESQUINA)) : null

  const alin = (a: Alineacion): Alineacion => (v === 1 ? ESPEJO[a] : a)
  const fuenteCondicion: IdFuente = p.condicion?.fuente ?? 'sora-semibold'
  return {
    ancho: W,
    alto: H,
    cajas: {
      logo999: logos[0] ?? VACIA,
      logoMarca: cajaMarca ?? VACIA,
      modelo: cajaModelo,
      escena: moto,
      frase: cajaFrase ?? VACIA,
      precio: cajaPrecio,
      condicion: cajaCondicion ?? VACIA,
      pie: cajaCta ?? VACIA,
      logoConcesionaria: logos[1] ?? VACIA,
    },
    alineaciones: {
      modelo: alin(p.modelo.alineacion),
      frase: alin(p.frase?.alineacion ?? 'izquierda'),
      precio: alin(p.precio.alineacion),
      condicion: alin(p.condicion?.alineacion ?? 'izquierda'),
    },
    estilos: { precio: p.precio.estilo },
    fuentes: { condicion: fuenteCondicion, pie: fuenteCondicion },
  }
}
