/**
 * Tamaños de letra de una plantilla de diseño, calculados con la heurística de siempre (ancho medio de
 * un carácter / tamaño, ver plantillas.ts) pero contra las CAJAS del layout. Puro: se testea sin dibujar.
 * Si algo no entra ni en su mínimo se lanza ErrorTextoLargo, igual que en las clásicas.
 */

import { esFuenteDeGuion, FUENTE_POR_DEFECTO, type IdFuente, type RolTexto } from '../fuentes-placa.ts'
import type { IdPlantillaDiseno } from '../tipos.ts'
import { ErrorTextoLargo, type Campo, type TextosPlaca } from '../plantillas.ts'
import type { Caja, LayoutDiseno } from './layouts.ts'
import { INCLINACION_POR_DEFECTO, type DisenoResuelto } from './tipos.ts'

export const PRECIO_OCULTO = 'CONSULTÁ PRECIO'
/** Cada paso de `tamanos` cambia la letra un 12 % (con 8 % casi no se notaba). */
export const PASO_TAMANO = 0.12

/**
 * Por fuente: ancho medio de un carácter / tamaño y alto de línea (conservador, como en las clásicas).
 * `ancho` vale para modelo y precio (mayúsculas y dígitos) y para texto con minúsculas; `mayus` es el de una frase escrita EN
 * mayúsculas (más ancha), si la fuente se usa así. Las de las fuentes elegibles se MIDIERON en el archivo (suma de avances de
 * "TRK 502 X", "$ 4.500.000", "Tu próxima moto" y la misma en mayúsculas) y se redondearon para arriba: fuentes-elegibles.test.ts
 * lo comprueba contra el archivo real (con un 3 % de margen sobre las peores muestras). Las siete de siempre (anton … sora) NO se tocan: así las placas ya armadas
 * no cambian; su desvío contra el archivo es de ~1 % y cae en el margen de 48 px del lienzo (tolerancia en el test). `linea` es el alto de la línea con que se dibuja (contiene la tinta de la fuente sin tildes).
 */
export const METRICAS: Record<IdFuente, { ancho: number; mayus?: number; linea: number }> = {
  anton: { ancho: 0.5, linea: 1 },
  inter: { ancho: 0.6, linea: 1.25 },
  kaushan: { ancho: 0.5, mayus: 0.64, linea: 1.25 },
  'barlow-condensed': { ancho: 0.45, linea: 1.1 },
  'archivo-expanded': { ancho: 0.74, mayus: 0.85, linea: 1.1 },
  'sora-extrabold': { ancho: 0.64, mayus: 0.72, linea: 1.2 },
  'sora-semibold': { ancho: 0.6, mayus: 0.71, linea: 1.25 },
  'bebas-neue': { ancho: 0.38, linea: 1 },
  oswald: { ancho: 0.51, mayus: 0.53, linea: 1.35 },
  'archivo-black': { ancho: 0.69, mayus: 0.75, linea: 1.1 },
  'russo-one': { ancho: 0.62, mayus: 0.68, linea: 1.05 },
  teko: { ancho: 0.42, mayus: 0.44, linea: 1 },
  montserrat: { ancho: 0.64, mayus: 0.72, linea: 1.15 },
  'black-ops-one': { ancho: 0.66, mayus: 0.68, linea: 1 },
  'caveat-brush': { ancho: 0.42, mayus: 0.49, linea: 1.2 },
  pacifico: { ancho: 0.5, mayus: 0.79, linea: 1.8 },
  lobster: { ancho: 0.5, mayus: 0.59, linea: 1.25 },
  bangers: { ancho: 0.43, linea: 1 },
}

/** La frase va en mayúsculas en la deportiva y la editorial (menos las de caligrafía, que se leen en minúsculas); en la impactante, tal cual. */
export const dibujaFraseEnMayusculas = (plantilla: IdPlantillaDiseno, fuente: IdFuente): boolean => plantilla !== 'impactante_textura' && !esFuenteDeGuion(fuente)

export type Tam = { tam: number; lineas: number }
export type AjusteDiseno = {
  modelo: Tam
  frase: Tam
  /** Lo que se dibuja como precio: el monto formateado o CONSULTÁ PRECIO. */
  textoPrecio: string
  precio: Tam
  /** 0 = no se dibuja, 1 = solo el texto, 2 = texto y destacado. */
  filasCondicion: 0 | 1 | 2
  /** Impactante y deportiva: el texto y el destacado van uno al lado del otro en UNA fila (en las demás, uno sobre otro). */
  condicionEnFila: boolean
  condicionTam: number
  ctaTam: number
  /** Ancho estimado de la pastilla del CTA (con su relleno). */
  ctaAncho: number
  lugarTam: number
  /** Editorial: el número gigante (0 = no se dibuja) y la lista lateral (0 = no se dibuja). */
  numeroTam: number
  listaTam: number
}

/** Qué fuente lleva cada texto en cada plantilla. */
export const FUENTE_DE: Record<IdPlantillaDiseno, { modelo: IdFuente; frase: IdFuente; precio: IdFuente; condicion: IdFuente; pie: IdFuente }> = {
  impactante_textura: { ...FUENTE_POR_DEFECTO.impactante_textura!, condicion: 'barlow-condensed', pie: 'barlow-condensed' },
  deportiva: { ...FUENTE_POR_DEFECTO.deportiva!, condicion: 'barlow-condensed', pie: 'barlow-condensed' },
  editorial: { ...FUENTE_POR_DEFECTO.editorial!, condicion: 'sora-semibold', pie: 'sora-semibold' },
}

type Regla = { fuente: IdFuente; /** El texto se dibuja en mayúsculas (más ancho). */ mayus?: boolean; lineas: number; min: number; /** Lo más grande que se pide aunque la caja deje más. */ tope: number; campo: Campo }

export type Alineacion = 'izquierda' | 'centro' | 'derecha'
type Rotacion = { grados: number; alinea: Alineacion; /** La caja completa del campo (la rotación gira alrededor del centro del propio texto). */ caja: { w: number; h: number }; /** Filas de texto del bloque (la deportiva parte la frase en dos). */ filas: number }

/** De qué lado de su caja se escribe cada texto (lo que dibujan los componentes de placas/). */
export function alineacionDe(plantilla: IdPlantillaDiseno, rol: RolTexto, posicionFrase: 'izquierda' | 'derecha' = 'izquierda'): Alineacion {
  if (plantilla === 'editorial') return 'izquierda'
  if (rol === 'frase') {
    if (plantilla === 'impactante_textura') return 'izquierda'
    return posicionFrase === 'derecha' ? 'derecha' : 'izquierda'
  }
  return 'centro'
}

/**
 * El rectángulo (relativo a la esquina de su caja) que ocupa un texto de `texto.w`×`texto.h` una vez rotado `grados` alrededor
 * de SU PROPIO centro (los componentes giran el bloque de texto, no la caja entera) y apoyado del lado que dice `alinea`. Sirve para comprobar que el texto inclinado sigue dentro de su zona.
 */
export function cajaRotada(texto: { w: number; h: number }, caja: { w: number; h: number }, grados: number, alinea: Alineacion): { minX: number; maxX: number; minY: number; maxY: number } {
  const x0 = alinea === 'izquierda' ? 0 : alinea === 'derecha' ? caja.w - texto.w : (caja.w - texto.w) / 2
  const y0 = (caja.h - texto.h) / 2
  const a = (grados * Math.PI) / 180
  const c = Math.cos(a)
  const sn = Math.sin(a)
  const cx = x0 + texto.w / 2
  const cy = caja.h / 2
  const xs: number[] = []
  const ys: number[] = []
  for (const [px, py] of [[x0, y0], [x0 + texto.w, y0], [x0, y0 + texto.h], [x0 + texto.w, y0 + texto.h]] as const) {
    const dx = px - cx
    const dy = py - cy
    xs.push(cx + dx * c - dy * sn)
    ys.push(cy + dx * sn + dy * c)
  }
  const r = (n: number) => Math.round(n * 1e9) / 1e9
  return { minX: r(Math.min(...xs)), maxX: r(Math.max(...xs)), minY: r(Math.min(...ys)), maxY: r(Math.max(...ys)) }
}

const minimo = (r: Regla): number => Math.min(r.min, r.tope)

/** Letra más grande a la que `texto` entra en `caja`, o null si ni en `min`. */
function mayorQueEntra(texto: string, caja: { w: number; h: number }, r: Regla): Tam | null {
  const n = texto.length
  const m = METRICAS[r.fuente]
  const ancho = r.mayus ? (m.mayus ?? m.ancho) : m.ancho
  // Una fuente de línea alta (Pacifico) en una caja baja puede no llegar al mínimo de siempre: el mínimo nunca pasa de lo que la caja admite.
  for (let tam = r.tope; tam >= minimo(r); tam--) {
    const porLinea = Math.max(1, Math.floor(caja.w / (tam * ancho)))
    const lineas = Math.ceil(n / porLinea)
    if (lineas <= r.lineas && lineas * tam * m.linea <= caja.h) return { tam, lineas }
  }
  return null
}

/**
 * Tamaño final: el "automático" es la letra cómoda (86 % de lo máximo que la caja admite), para que +1 y +2
 * tengan lugar; `paso` (−2..+2) lo mueve de a 12 % sin pasar nunca de lo que entra en la caja.
 */
function ajustarCampo(texto: string, caja: { w: number; h: number }, r: Regla, paso: number, rot?: Rotacion): Tam {
  if (texto.length === 0) return { tam: minimo(r), lineas: 0 }
  const max = mayorQueEntra(texto, caja, r)
  if (!max) throw new ErrorTextoLargo(r.campo)
  const auto = Math.max(minimo(r), Math.min(max.tam, Math.floor(r.tope * 0.86)))
  const pedido = Math.round(auto * (1 + PASO_TAMANO * paso))
  const tam = Math.max(minimo(r), Math.min(pedido, max.tam))
  const base = mayorQueEntra(texto, caja, { ...r, tope: tam }) ?? max
  return rot && rot.grados !== 0 ? entraRotado(texto, base, r, rot) : base
}

/**
 * Inclinado, el texto ocupa más alto: se achica hasta que su rectángulo ROTADO entre en la caja del campo (y, como la caja nunca toca
 * la franja de la moto, tampoco el texto). Puede bajar hasta el 60 % del mínimo de siempre; si ni así entra, ErrorTextoLargo.
 */
function entraRotado(texto: string, inicial: Tam, r: Regla, rot: Rotacion): Tam {
  const m = METRICAS[r.fuente]
  const ancho = r.mayus ? (m.mayus ?? m.ancho) : m.ancho
  const piso = Math.max(8, Math.floor(minimo(r) * 0.6))
  let actual: Tam | null = inicial
  while (actual) {
    const w = actual.lineas === 1 ? Math.min(rot.caja.w, texto.length * actual.tam * ancho) : rot.caja.w
    const h = actual.lineas * rot.filas * actual.tam * m.linea
    const caja = cajaRotada({ w, h }, rot.caja, rot.grados, rot.alinea)
    // Pegado a un lado, la esquina del texto girado se asoma hasta (alto/2)·sen hacia afuera de ese lado: cabe en el margen del lienzo (48 px).
    const holgura = rot.alinea === 'centro' ? 0.5 : (h / 2) * Math.abs(Math.sin((rot.grados * Math.PI) / 180)) + 0.5
    if (caja.minX >= -holgura && caja.maxX <= rot.caja.w + holgura && caja.minY >= 0 && caja.maxY <= rot.caja.h) return actual
    if (actual.tam <= piso) break
    actual = mayorQueEntra(texto, { w: r.lineas === 1 ? rot.caja.w : rot.caja.w, h: rot.caja.h / rot.filas }, { ...r, tope: actual.tam - 1, min: piso })
  }
  throw new ErrorTextoLargo(r.campo)
}

const medida = (c: Caja) => ({ w: c.w, h: c.h })

export function ajustarDiseno(textos: TextosPlaca, d: DisenoResuelto, layout: LayoutDiseno, plantilla: IdPlantillaDiseno = 'impactante_textura'): AjusteDiseno {
  const { cajas } = layout
  const fu = FUENTE_DE[plantilla]
  // Las fuentes de los tres textos grandes son las elegidas (o las de siempre): cada una con su ancho y su alto de línea.
  const fModelo = d.fuentes.modelo
  const fFrase = d.fuentes.frase
  const fPrecio = d.fuentes.precio
  const gira = (rol: RolTexto, caja: Caja, filas = 1): Rotacion | undefined =>
    d.inclinacion[rol] === INCLINACION_POR_DEFECTO[plantilla]![rol] ? undefined : { grados: d.inclinacion[rol], alinea: alineacionDe(plantilla, rol, d.posicionFrase), caja: medida(caja), filas }
  const modelo = ajustarCampo(textos.modelo.trim(), medida(cajas.modelo), { fuente: fModelo, lineas: 2, min: 44, tope: Math.floor(cajas.modelo.h / METRICAS[fModelo].linea), campo: 'modelo' }, d.tamanos.modelo, gira('modelo', cajas.modelo))
  // La bajada de la editorial va en una línea y con las letras espaciadas (ocupa más): se le da menos ancho.
  const editorial = plantilla === 'editorial'
  const mayus = dibujaFraseEnMayusculas(plantilla, fFrase)
  // La deportiva la parte en dos líneas fijas (dos colores): cada una tiene que entrar en el ancho, o la de abajo se sale de la caja.
  const [linea1, linea2] = plantilla === 'deportiva' ? partirFrase(d.frase) : ['', '']
  const nLineasDep = linea2 ? 2 : 1
  const frase =
    plantilla === 'deportiva' && d.frase.trim() !== ''
      ? {
          ...ajustarCampo(linea1.length >= linea2.length ? linea1 : linea2, { w: cajas.frase.w, h: cajas.frase.h / nLineasDep }, { fuente: fFrase, mayus, lineas: 1, min: 30, tope: Math.floor(cajas.frase.h / (METRICAS[fFrase].linea * nLineasDep)), campo: 'titular' }, d.tamanos.frase, gira('frase', cajas.frase, nLineasDep)),
          lineas: nLineasDep,
        }
      : ajustarCampo(
          d.frase.trim(),
          editorial ? { w: cajas.frase.w * 0.78, h: cajas.frase.h } : medida(cajas.frase),
          { fuente: fFrase, mayus, lineas: editorial ? 1 : 2, min: editorial ? 22 : 30, tope: Math.floor(cajas.frase.h / (METRICAS[fFrase].linea * (editorial ? 1 : 2))), campo: 'titular' },
          d.tamanos.frase,
          gira('frase', cajas.frase),
        )

  const textoPrecio = d.mostrarPrecio ? textos.precio.trim() : PRECIO_OCULTO
  const precio = ajustarCampo(textoPrecio, medida(cajas.precio), { fuente: fPrecio, lineas: 1, min: 36, tope: Math.floor(cajas.precio.h / METRICAS[fPrecio].linea), campo: 'precio' }, d.tamanos.precio, gira('precio', cajas.precio))

  // Condición: el texto y, si hay, el destacado en una pastilla debajo; cada uno en una línea.
  const texto = d.condicion.texto.trim()
  const destacado = d.condicion.destacado.trim()
  const filasCondicion = (texto ? (destacado ? 2 : 1) : destacado ? 1 : 0) as 0 | 1 | 2
  const condicionEnFila = plantilla !== 'editorial'
  let condicionTam = 0
  if (filasCondicion > 0 && condicionEnFila) {
    // Una sola fila: "12 CUOTAS [SIN INTERÉS]". El destacado lleva relleno a los costados y hay un espacio entre los dos.
    const regla = { fuente: fu.condicion, lineas: 1, min: 24, tope: Math.floor(cajas.condicion.h / METRICAS[fu.condicion].linea), campo: 'promo' as const }
    const extra = texto && destacado ? 48 + 20 : destacado ? 48 : 0
    condicionTam = ajustarCampo([texto, destacado].filter(Boolean).join(' '), { w: cajas.condicion.w - extra, h: cajas.condicion.h }, regla, 0).tam
  } else if (filasCondicion > 0) {
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

  // Editorial: el número gigante (ancho de un dígito ~0.72 del tamaño) y la lista lateral.
  let numeroTam = 0
  let listaTam = 0
  if (editorial && cajas.numero && cajas.lista) {
    if (d.numero.length > 0) numeroTam = Math.floor(Math.min(cajas.numero.h * 0.9, cajas.numero.w / (d.numero.length * 0.72)))
    const mayor = Math.max(0, ...d.lista.map((x) => x.length))
    if (mayor > 0) {
      listaTam = Math.min(28, Math.floor(cajas.lista.w / (mayor * 0.62)))
      if (listaTam < 14) throw new ErrorTextoLargo('titular')
    }
  }

  return { modelo, frase, textoPrecio, precio, filasCondicion, condicionEnFila, condicionTam, ctaTam, ctaAncho, lugarTam: lugar.tam, numeroTam, listaTam }
}

/**
 * La frase de la deportiva va en dos colores y en dos líneas: se parte por palabras donde las dos líneas quedan lo más parejas
 * posible ("Tu próxima aventura" → "Tu próxima" / "aventura"), como "ROMPÉ LA / RUTINA" de la referencia. Una palabra sola no se parte.
 */
export function partirFrase(frase: string): [string, string] {
  const palabras = frase.trim().split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return ['', '']
  if (palabras.length === 1) return [palabras[0]!, '']
  let mejor = 1
  let peor = Infinity
  for (let corte = 1; corte < palabras.length; corte++) {
    const largo = Math.max(palabras.slice(0, corte).join(' ').length, palabras.slice(corte).join(' ').length)
    if (largo < peor) {
      peor = largo
      mejor = corte
    }
  }
  return [palabras.slice(0, mejor).join(' '), palabras.slice(mejor).join(' ')]
}
