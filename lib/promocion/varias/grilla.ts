/**
 * La GRILLA de motos (ADR-041): sin una foto de referencia, una placa de varias motos se arma con las FOTOS REALES de las motos, una tarjeta por moto
 * con su modelo, su precio y su condición debajo (o al lado). No usa IA: no cuesta nada, no hay nada que revisar y ninguna moto se altera. Todo lo que se
 * puede decidir sin dibujar vive acá (qué se escribe, dónde va cada cosa y a qué tamaño) para testearlo sin satori; el componente PlacaGrilla solo pinta.
 */

import type { AspectoFoto } from '../../productor/ediciones.ts'
import { METRICAS } from '../diseno/ajuste.ts'
import type { Ocultable } from '../diseno/tipos.ts'
import { formatearPrecio, lineaPromo } from '../datos.ts'
import { ErrorTextoLargo, medidasDe, type Campo } from '../plantillas.ts'
import type { DatosPromocion } from '../tipos.ts'
import type { MotoExtra } from './tipos.ts'

export type MotoDeGrilla = { modelo: string; precio: string; condicion: string }
export type TextosGrilla = { marca: string; titular: string; extra: string; lugar: string; motos: MotoDeGrilla[] }

/** Lo que se escribe en la grilla. El precio de cada moto sale de su dato cargado, nunca de un modelo. Un texto sacado (diseno.ocultos) queda vacío y no se dibuja. */
export function textosDeGrilla(p: {
  marca: string
  modelo: string
  datos: DatosPromocion
  motosExtra: readonly MotoExtra[]
  titular: string | null
  titularDelTexto: string | null
  lineaExtra: string | null
  ocultos?: readonly Ocultable[]
}): TextosGrilla {
  const fuera = (o: Ocultable) => p.ocultos?.includes(o) ?? false
  const sin = (o: Ocultable, t: string) => (fuera(o) ? '' : t)
  const motos = [{ modelo: p.modelo, precio: p.datos.precio, promo: p.datos.promo }, ...p.motosExtra]
  return {
    marca: fuera('logo999') || fuera('logoConcesionaria') ? '' : p.marca,
    titular: sin('frase', (p.titular ?? p.titularDelTexto ?? '').trim()),
    extra: p.lineaExtra?.trim() ?? '',
    lugar: sin('lugar', p.datos.lugar.trim()),
    motos: motos.map((m) => ({ modelo: sin('modelo', m.modelo), precio: sin('precio', formatearPrecio(m.precio)), condicion: sin('condicion', lineaPromo(m.promo)) })),
  }
}

export type Caja = { x: number; y: number; w: number; h: number }
export type TextoAjustado = { caja: Caja; tam: number; lineas: number }
/** Un texto de una tarjeta: tamaño de letra, cantidad de renglones, alto de cada renglón y el ancho que ocupa el más largo. */
export type TextoDeTarjeta = { tam: number; lineas: number; alturaLinea: number; anchoLinea: number }
export type TarjetaGrilla = {
  caja: Caja
  foto: Caja
  /** La caja donde van el modelo, el precio y la condición (debajo de la foto, o a su lado en una tarjeta horizontal). */
  texto: Caja
  orientacion: 'vertical' | 'horizontal'
  modelo: TextoDeTarjeta
  precio: TextoDeTarjeta
  condicion: TextoDeTarjeta
  /** Separación entre el modelo, el precio y la condición. */
  separacion: number
}
export type LayoutGrilla = {
  ancho: number
  alto: number
  columnas: number
  logo999: Caja
  logoConcesionaria: Caja
  titular: TextoAjustado
  tarjetas: TarjetaGrilla[]
  extra: TextoAjustado
  lugar: TextoAjustado
}

/** El texto largo dice de qué moto habla (la pantalla lo muestra tal cual). */
export class ErrorTextoLargoMoto extends ErrorTextoLargo {
  override name = 'ErrorTextoLargoMoto'
  readonly moto: number
  constructor(campo: Campo, moto: number) {
    super(campo)
    this.moto = moto
    this.message = `Moto ${moto}: ${this.message[0]!.toLowerCase()}${this.message.slice(1)}`
  }
}

const M = 48
const G = 24
const LOGO = { w: 260, h: 72 }
const SEP_ENCABEZADO = 16
const TITULAR_ALTO: Record<AspectoFoto, number> = { '1:1': 110, '4:5': 130, '9:16': 190 }
const TITULAR_BASE: Record<AspectoFoto, number> = { '1:1': 60, '4:5': 68, '9:16': 80 }
const ALTO_EXTRA = 44
const ALTO_LUGAR = 40
const FOTO_HORIZONTAL = 0.52
/** Alto de tarjeta desde el cual una tarjeta de una columna es "ancha" (foto arriba) y no "horizontal" (foto al costado). */
const ALTO_TARJETA_ANCHA = 560

/** Cuántas columnas por formato y cantidad de motos: 1:1 una por moto; 4:5 de a una (4 motos: 2×2); 9:16 de a una. */
const columnasDe = (formato: AspectoFoto, n: number): number => (formato === '1:1' ? n : formato === '4:5' && n === 4 ? 2 : 1)

type Fuente = 'anton' | 'inter'
type Regla = { fuente: Fuente; base: number; min: number; lineas: number; factor?: number }

const anchoDe = (r: Regla): number => r.factor ?? METRICAS[r.fuente].ancho
const lineaDe = (fuente: Fuente): number => METRICAS[fuente].linea

/** La letra más grande (hasta `base`) con que el texto entra en `w` × `h`, partido en hasta `lineas` renglones. null = ni en el mínimo entra. */
function ajustarEnCaja(texto: string, w: number, h: number, r: Regla): { tam: number; lineas: number } | null {
  const n = texto.length
  if (n === 0) return { tam: r.base, lineas: 0 }
  for (let tam = r.base; tam >= r.min; tam--) {
    const porLinea = Math.max(1, Math.floor(w / (tam * anchoDe(r))))
    const lineas = Math.ceil(n / porLinea)
    if (lineas <= r.lineas && lineas * tam * lineaDe(r.fuente) <= h) return { tam, lineas }
  }
  return null
}

/** Las reglas de las letras de una tarjeta según el ancho de su caja de texto. */
function reglasDeTarjeta(w: number): { modelo: Regla; precio: Regla; condicion: Regla } {
  if (w >= 700) return { modelo: { fuente: 'anton', base: 64, min: 36, lineas: 2 }, precio: { fuente: 'anton', base: 80, min: 44, lineas: 1 }, condicion: { fuente: 'inter', base: 34, min: 22, lineas: 2 } }
  if (w >= 380) return { modelo: { fuente: 'anton', base: 52, min: 30, lineas: 2 }, precio: { fuente: 'anton', base: 64, min: 36, lineas: 1 }, condicion: { fuente: 'inter', base: 28, min: 20, lineas: 2 } }
  return { modelo: { fuente: 'anton', base: 40, min: 26, lineas: 2 }, precio: { fuente: 'anton', base: 44, min: 28, lineas: 1 }, condicion: { fuente: 'inter', base: 24, min: 18, lineas: 2 } }
}

const SEPARACION_TARJETA = 10
/** Hasta dónde se achica todo el bloque de una tarjeta para que entre (como en las otras placas: más que eso, se pide acortar). */
const ESCALA_MINIMA = 0.7

/** El bloque de texto de UNA tarjeta: cada texto con su letra, y todo junto achicado parejo hasta que entre en la caja. */
function ajustarTarjeta(m: MotoDeGrilla, caja: Caja, moto: number): Pick<TarjetaGrilla, 'modelo' | 'precio' | 'condicion' | 'separacion'> {
  const reglas = reglasDeTarjeta(caja.w)
  const campos = [['modelo', m.modelo, 'modelo'], ['precio', m.precio, 'precio'], ['condicion', m.condicion, 'promo']] as const
  const reservado = SEPARACION_TARJETA * 2
  for (let escala = 1; escala >= ESCALA_MINIMA - 1e-9; escala -= 0.04) {
    const fit = {} as Record<'modelo' | 'precio' | 'condicion', TextoDeTarjeta>
    let total = reservado
    for (const [clave, texto] of campos) {
      const r = reglas[clave]
      const escalada: Regla = { ...r, base: Math.max(r.min, Math.floor(r.base * escala)), min: Math.floor(r.min * 0.8) }
      const a = ajustarEnCaja(texto.trim(), caja.w, Number.POSITIVE_INFINITY, escalada)
      if (!a) throw new ErrorTextoLargoMoto(campos.find((c) => c[0] === clave)![2], moto)
      const largo = Math.min(texto.trim().length, Math.max(1, Math.floor(caja.w / (a.tam * anchoDe(r)))))
      fit[clave] = { tam: a.tam, lineas: a.lineas, alturaLinea: lineaDe(r.fuente), anchoLinea: a.lineas === 0 ? 0 : Math.min(caja.w, largo * a.tam * anchoDe(r)) }
      total += a.tam * lineaDe(r.fuente) * a.lineas
    }
    if (total <= caja.h) return { ...fit, separacion: SEPARACION_TARJETA }
  }
  // Ni achicando todo entra: se pide acortar el texto más alto.
  const alto = campos.map(([c, t]) => [c, t.trim().length] as const).sort((a, b) => b[1] - a[1])[0]![0]
  throw new ErrorTextoLargoMoto(campos.find((c) => c[0] === alto)![2], moto)
}

export function layoutGrilla(textos: TextosGrilla, formato: AspectoFoto): LayoutGrilla {
  const { ancho, alto } = medidasDe(formato)
  const n = textos.motos.length
  const anchoUtil = ancho - 2 * M

  // Encabezado: los dos logos y el titular.
  const logo999: Caja = { x: M, y: M, w: LOGO.w, h: LOGO.h }
  const logoConcesionaria: Caja = { x: ancho - M - LOGO.w, y: M, w: LOGO.w, h: LOGO.h }
  const tituloH = textos.titular ? TITULAR_ALTO[formato] : 0
  const tituloY = M + LOGO.h + SEP_ENCABEZADO
  const titularRegla: Regla = { fuente: 'anton', base: TITULAR_BASE[formato], min: 32, lineas: 2 }
  const t = ajustarEnCaja(textos.titular, anchoUtil, tituloH, titularRegla)
  if (!t) throw new ErrorTextoLargo('titular')
  const titular: TextoAjustado = { caja: { x: M, y: tituloY, w: anchoUtil, h: tituloH }, ...t }

  // Pie: la línea extra y el lugar.
  const hayExtra = textos.extra !== ''
  const hayLugar = textos.lugar !== ''
  const pieH = (hayLugar ? ALTO_LUGAR : 0) + (hayExtra ? ALTO_EXTRA : 0) + (hayLugar && hayExtra ? 8 : 0)
  const reglaLugar: Regla = { fuente: 'inter', base: 28, min: 20, lineas: 1 }
  const reglaExtra: Regla = { fuente: 'inter', base: 30, min: 20, lineas: 1, factor: 0.72 }
  const l = ajustarEnCaja(textos.lugar, anchoUtil, ALTO_LUGAR, reglaLugar)
  if (!l) throw new ErrorTextoLargo('lugar')
  const e = ajustarEnCaja(textos.extra, anchoUtil, ALTO_EXTRA, reglaExtra)
  if (!e) throw new ErrorTextoLargo('extra')
  const lugar: TextoAjustado = { caja: { x: M, y: alto - M - (hayLugar ? ALTO_LUGAR : 0), w: anchoUtil, h: hayLugar ? ALTO_LUGAR : 0 }, ...l }
  const extra: TextoAjustado = { caja: { x: M, y: alto - M - (hayLugar ? ALTO_LUGAR + 8 : 0) - (hayExtra ? ALTO_EXTRA : 0), w: anchoUtil, h: hayExtra ? ALTO_EXTRA : 0 }, ...e }

  // El cuerpo: entre el encabezado y el pie.
  const y0 = M + LOGO.h + SEP_ENCABEZADO + (tituloH > 0 ? tituloH + SEP_ENCABEZADO : 0) + 8
  const y1 = alto - M - pieH - (pieH > 0 ? 16 : 0)
  const cuerpoH = y1 - y0
  const columnas = columnasDe(formato, n)
  const filas = Math.ceil(n / columnas)
  const celdaW = Math.floor((anchoUtil - (columnas - 1) * G) / columnas)
  const celdaH = Math.floor((cuerpoH - (filas - 1) * G) / filas)

  const tarjetas: TarjetaGrilla[] = []
  if (columnas === 1 && celdaH < ALTO_TARJETA_ANCHA) {
    // Una columna de tarjetas horizontales: la foto a la izquierda y el texto a su lado.
    const fotoW = Math.round(anchoUtil * FOTO_HORIZONTAL)
    textos.motos.forEach((m, i) => {
      const y = y0 + i * (celdaH + G)
      const caja: Caja = { x: M, y, w: anchoUtil, h: celdaH }
      const texto: Caja = { x: M + fotoW + 24, y: y + 16, w: anchoUtil - fotoW - 48, h: celdaH - 32 }
      tarjetas.push({ caja, foto: { x: M, y, w: fotoW, h: celdaH }, texto, orientacion: 'horizontal', ...ajustarTarjeta(m, texto, i + 1) })
    })
  } else {
    // Tarjetas verticales: la foto arriba (4:3 si entra) y el texto debajo. Las filas se centran en el cuerpo.
    const textoH = columnas === 1 ? 200 : celdaW >= 400 ? 230 : 200
    const pad = celdaW >= 400 ? 20 : 12
    const fotoH = Math.min(Math.round(celdaW * (columnas === 1 ? 0.6 : celdaW >= 400 ? 0.75 : 1)), celdaH - textoH)
    const tarjetaH = fotoH + textoH
    const bloque = filas * tarjetaH + (filas - 1) * G
    const arriba = y0 + Math.max(0, Math.floor((cuerpoH - bloque) / 2))
    textos.motos.forEach((m, i) => {
      const fila = Math.floor(i / columnas)
      const col = i % columnas
      const x = M + col * (celdaW + G)
      const y = arriba + fila * (tarjetaH + G)
      const texto: Caja = { x: x + pad, y: y + fotoH + 10, w: celdaW - 2 * pad, h: textoH - 10 - pad }
      tarjetas.push({ caja: { x, y, w: celdaW, h: tarjetaH }, foto: { x, y, w: celdaW, h: fotoH }, texto, orientacion: 'vertical', ...ajustarTarjeta(m, texto, i + 1) })
    })
  }

  return { ancho, alto, columnas, logo999, logoConcesionaria, titular, tarjetas, extra, lugar }
}
