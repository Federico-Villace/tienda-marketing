/**
 * De la lectura cruda (ya parseada por esquema.ts) a una PlantillaReferencia usable: coordenadas en px, dentro del lienzo
 * y del margen, sin cajas encimadas, con mínimos, con contraste y con fuentes de la lista cerrada. Pura y determinística:
 * el mismo input da siempre lo mismo (se cachea el resultado). Lo que no se puede arreglar es "inutilizable" y la persona
 * cae en una de las tres plantillas de siempre (`fallback`), sin perder la lectura que ya se pagó.
 */

import { ACENTOS_DE } from '../diseno/paletas.ts'
import { INCLINACIONES, type Acento } from '../diseno/tipos.ts'
import { BLANCO_LEGIBLE, colorLegible, luminancia, mezclar, NEGRO_LEGIBLE } from './contraste.ts'
import { esSustitucion, fuenteDeCategoria } from './fuentes.ts'
import { agrandar, cumple, despejar, recortar } from './geometria.ts'
import type {
  Aviso,
  CajaPx,
  CajaRel,
  Hex,
  LecturaCruda,
  MotivoInutilizable,
  NombreZona,
  PlantillaFallback,
  PlantillaReferencia,
  ResultadoReparacion,
  ZonaCruda,
} from './tipos.ts'

export const ANCHO_REF = 1080
export const MARGEN_X = 48
export const MARGEN_Y = 24

/**
 * Mínimos (px a 1080 de ancho). Salen de medir el peor caso con TODAS las fuentes de cada rol (fuentes-elegibles.test.ts): con
 * estas cajas el texto más largo que se prueba ahí entra a un tamaño legible, sea cual sea la fuente que se elija.
 */
export const MINIMOS = {
  modelo: { w: 500, h: 64 },
  precio: { w: 400, h: 60 },
  condicion: { w: 380, h: 40 },
  frase: { w: 300, h: 50 },
  cta: { w: 360, h: 44 },
  logo: { w: 120, h: 48 },
} as const

/** Proporción de la imagen que se acepta (las fotos van de 512 a 2048 de lado). */
const RATIO_MIN = 0.2
const RATIO_MAX = 5
const MOTO_MIN_ANCHO = 0.45
const MOTO_MIN_ALTO = 0.25
const MOTO_MAX_AREA = 0.75
const CONTRASTE_GRANDE = 3
const CONTRASTE_CHICO = 4.5
const ACENTO_DEFECTO: Hex = '#2F6BFF'

const nombreAviso = (zona: NombreZona, codigo: Aviso['codigo']): Aviso => ({ zona, codigo })

/** Caja relativa → px sobre el lienzo, recortada a la imagen. null si no queda área. */
function aPx(c: CajaRel, W: number, H: number): CajaPx | null {
  const x = Math.min(1, Math.max(0, c.x))
  const y = Math.min(1, Math.max(0, c.y))
  const w = Math.min(Math.max(c.w, 0), 1 - x)
  const h = Math.min(Math.max(c.h, 0), 1 - y)
  const px: CajaPx = { x: Math.round(x * W), y: Math.round(y * H), w: Math.round(w * W), h: Math.round(h * H) }
  return px.w > 0 && px.h > 0 ? px : null
}

/** Lo más cercano de INCLINACIONES (en un empate, la de menor valor absoluto). */
export function inclinacionCercana(g: number | null): number {
  if (g === null) return 0
  let mejor = 0
  for (const i of INCLINACIONES) {
    const d = Math.abs(i - g)
    const dm = Math.abs(mejor - g)
    if (d < dm || (d === dm && Math.abs(i) < Math.abs(mejor))) mejor = i
  }
  return mejor
}

const rgb = (h: Hex): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

function azulSaturado(h: Hex): boolean {
  const [r, g, b] = rgb(h)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return b === max && max > 0 && (max - min) / max >= 0.55 && b - r >= 60 && b - g >= 40
}

function fallbackDe(l: LecturaCruda): { fallback: PlantillaFallback; acento: Acento | null } {
  const fondo = l.fondo.color
  const fallback: PlantillaFallback = !fondo ? 'impactante_textura' : azulSaturado(fondo) ? 'deportiva' : luminancia(fondo) < 0.3 ? 'impactante_textura' : 'editorial'
  let acento: Acento | null = null
  if (l.acento) {
    let mejor = Infinity
    const [r, g, b] = rgb(l.acento)
    for (const [id, c] of Object.entries(ACENTOS_DE[fallback]) as [Acento, { hex: Hex }][]) {
      const [cr, cg, cb] = rgb(c.hex)
      const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2
      if (d < mejor) (mejor = d), (acento = id)
    }
  }
  return { fallback, acento }
}

const inutilizable = (l: LecturaCruda, motivo: Exclude<MotivoInutilizable, 'ok'>): ResultadoReparacion => ({ ok: false, motivo, ...fallbackDe(l) })

export function repararPlantilla(lectura: LecturaCruda, ref: { anchoRef: number; altoRef: number }): ResultadoReparacion {
  const { anchoRef, altoRef } = ref
  if (!Number.isFinite(anchoRef) || !Number.isFinite(altoRef) || anchoRef <= 0 || altoRef <= 0) return inutilizable(lectura, 'formato_invalido')
  const razon = altoRef / anchoRef
  if (razon < RATIO_MIN || razon > RATIO_MAX) return inutilizable(lectura, 'formato_invalido')
  if (!lectura.utilizable) return inutilizable(lectura, lectura.motivo === 'ok' ? 'ilegible' : lectura.motivo)

  const W = ANCHO_REF
  const H = Math.round(W * razon)
  const avisos: Aviso[] = []
  const aviso = (zona: NombreZona, codigo: Aviso['codigo']) => {
    if (!avisos.some((a) => a.zona === zona && a.codigo === codigo)) avisos.push(nombreAviso(zona, codigo))
  }

  const { zonas } = lectura
  const motoCruda = zonas.moto ? aPx(zonas.moto.caja, W, H) : null
  if (!motoCruda) return inutilizable(lectura, 'sin_moto')
  const modeloCruda = zonas.modelo ? aPx(zonas.modelo.caja, W, H) : null
  const precioCruda = zonas.precio ? aPx(zonas.precio.caja, W, H) : null
  if (!zonas.modelo || !zonas.precio || !modeloCruda || !precioCruda) return inutilizable(lectura, 'sin_zonas')

  // ── Moto: al menos 45 % del ancho y 25 % del alto, como mucho 75 % del área.
  const lienzo: CajaPx = { x: 0, y: 0, w: W, h: H }
  let moto = motoCruda
  const minMoto = { w: Math.ceil(W * MOTO_MIN_ANCHO), h: Math.ceil(H * MOTO_MIN_ALTO) }
  if (!cumple(moto, minMoto)) {
    moto = agrandar(moto, minMoto, lienzo) ?? moto
    aviso('moto', 'moto_agrandada')
  }
  if (moto.w * moto.h > W * H * MOTO_MAX_AREA) {
    const k = Math.sqrt((W * H * MOTO_MAX_AREA) / (moto.w * moto.h))
    const w = Math.floor(moto.w * k)
    const h = Math.floor(moto.h * k)
    moto = { x: moto.x + Math.round((moto.w - w) / 2), y: moto.y + Math.round((moto.h - h) / 2), w, h }
    aviso('moto', 'caja_corregida')
  }

  // ── Fondo (un color plano, un degradé o —si era una foto— el color que se declaró).
  const colorFondo: Hex = lectura.fondo.color ?? NEGRO_LEGIBLE
  const degrada = lectura.fondo.tipo === 'degradado' && lectura.fondo.color2 !== null
  const fondo: PlantillaReferencia['fondo'] = degrada
    ? { tipo: 'degradado', color: colorFondo, color2: lectura.fondo.color2, direccion: lectura.fondo.direccion ?? 'vertical' }
    : { tipo: 'liso', color: colorFondo, color2: null, direccion: 'vertical' }
  const acento: Hex = lectura.acento ?? ACENTO_DEFECTO
  /** Color de lo que hay DETRÁS del centro de una caja (el degradé interpolado). */
  const detras = (c: CajaPx): Hex => {
    if (fondo.tipo === 'liso' || !fondo.color2) return fondo.color
    const t = fondo.direccion === 'vertical' ? (c.y + c.h / 2) / H : (c.x + c.w / 2) / W
    return mezclar(fondo.color, fondo.color2, t)
  }

  // ── Texto y logos, por prioridad: precio > modelo > condición > frase > CTA > logos.
  const limites: CajaPx = { x: MARGEN_X, y: MARGEN_Y, w: W - 2 * MARGEN_X, h: H - 2 * MARGEN_Y }
  const colocadas: CajaPx[] = [moto]
  const colocar = (cruda: CajaPx, min: { w: number; h: number }): CajaPx | null => {
    const base = recortar(cruda, limites) ?? cruda
    const grande = agrandar(base, min, limites)
    if (!grande) return null
    const libre = despejar(grande, colocadas, limites, min)
    if (libre) colocadas.push(libre)
    return libre
  }
  const opcional = (z: ZonaCruda | null, min: { w: number; h: number }, nombre: NombreZona): CajaPx | null => {
    if (!z) return null
    const px = aPx(z.caja, W, H)
    if (!px) return null
    const c = colocar(px, min)
    if (!c) aviso(nombre, 'descartada_sin_espacio')
    return c
  }

  const cajaPrecio = colocar(precioCruda, MINIMOS.precio)
  if (!cajaPrecio) return inutilizable(lectura, 'sin_espacio')
  const cajaModelo = colocar(modeloCruda, MINIMOS.modelo)
  if (!cajaModelo) return inutilizable(lectura, 'sin_espacio')
  const cajaCondicion = opcional(zonas.condicion, MINIMOS.condicion, 'condicion')
  const cajaFrase = opcional(zonas.frase, MINIMOS.frase, 'frase')
  const cajaCta = opcional(zonas.cta, MINIMOS.cta, 'cta')
  const logos: CajaPx[] = []
  for (const l of zonas.logos) {
    const px = aPx(l, W, H)
    if (!px) continue
    const c = colocar(px, MINIMOS.logo)
    if (c) logos.push(c)
    else aviso('logo', 'descartada_sin_espacio')
  }

  // ── Color de cada texto: contra lo que hay detrás.
  const legible = (zona: NombreZona, pedido: Hex | null, sobre: Hex, minimo: number): Hex => {
    const elegido = pedido ?? colorLegible(BLANCO_LEGIBLE, sobre, minimo)
    const final = colorLegible(elegido, sobre, minimo)
    if (pedido !== null && final !== pedido) aviso(zona, 'color_corregido')
    return final
  }
  const fuenteDe = (rol: 'modelo' | 'frase' | 'precio', z: ZonaCruda) => {
    if (esSustitucion(rol, z.fuente)) aviso(rol, 'fuente_sustituida')
    return fuenteDeCategoria(rol, z.fuente)
  }

  const estilo = zonas.precio.estilo ?? 'texto'
  const rellenoPrecio = estilo === 'texto' ? null : (zonas.precio.relleno ?? acento)
  const plantilla: PlantillaReferencia = {
    ancho: W,
    alto: H,
    fondo,
    acento,
    moto,
    modelo: {
      caja: cajaModelo,
      color: legible('modelo', zonas.modelo.color, detras(cajaModelo), CONTRASTE_GRANDE),
      fuente: fuenteDe('modelo', zonas.modelo),
      alineacion: zonas.modelo.alineacion ?? 'izquierda',
      mayusculas: zonas.modelo.mayusculas ?? true,
      inclinacion: inclinacionCercana(zonas.modelo.inclinacion),
    },
    precio: {
      caja: cajaPrecio,
      color: legible('precio', zonas.precio.color, rellenoPrecio ?? detras(cajaPrecio), CONTRASTE_GRANDE),
      fuente: fuenteDe('precio', zonas.precio),
      alineacion: zonas.precio.alineacion ?? 'centro',
      estilo,
      relleno: rellenoPrecio,
    },
    condicion:
      cajaCondicion && zonas.condicion
        ? {
            caja: cajaCondicion,
            color: legible('condicion', zonas.condicion.color, detras(cajaCondicion), CONTRASTE_CHICO),
            fuente: fuenteDeCategoriaCondicion(zonas.condicion),
            alineacion: zonas.condicion.alineacion ?? 'izquierda',
          }
        : null,
    frase:
      cajaFrase && zonas.frase
        ? {
            caja: cajaFrase,
            color: legible('frase', zonas.frase.color, detras(cajaFrase), CONTRASTE_GRANDE),
            fuente: fuenteDe('frase', zonas.frase),
            alineacion: zonas.frase.alineacion ?? 'izquierda',
            inclinacion: inclinacionCercana(zonas.frase.inclinacion),
          }
        : null,
    cta:
      cajaCta && zonas.cta
        ? { caja: cajaCta, color: legible('cta', zonas.cta.color, zonas.cta.relleno ?? detras(cajaCta), CONTRASTE_CHICO), relleno: zonas.cta.relleno }
        : null,
    logos,
  }
  return { ok: true, plantilla, avisos }
}

function fuenteDeCategoriaCondicion(z: ZonaCruda) {
  return fuenteDeCategoria('condicion', z.fuente)
}
