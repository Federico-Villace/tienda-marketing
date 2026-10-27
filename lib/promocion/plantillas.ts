/**
 * Plantillas de la placa: datos puros, sin render ni fuentes. Todo lo que se puede
 * decidir sin dibujar vive acá (medidas, zonas, tamaños de letra) para testearlo
 * sin satori; el componente <Placa> solo lo pinta.
 *
 * El ancho de un texto se ESTIMA con un factor por fuente (ancho medio de un
 * carácter / tamaño). Es una heurística conservadora: satori y el navegador pueden
 * diferir unos píxeles, por eso el factor sobra un poco (ADR-027, riesgo R15).
 */

import type { AspectoFoto } from '../productor/ediciones.ts'
import { estiloDe, posicionTextoDe, zonaDe, type EstiloPlaca, type IdFondo, type IdPlantilla, type PosicionMoto, type PosicionTexto, type ZonaTexto } from './tipos.ts'

export const MEDIDAS = {
  '1:1': [1080, 1080],
  '4:5': [1080, 1350],
  '9:16': [1080, 1920],
} as const satisfies Record<AspectoFoto, readonly [number, number]>

export const medidasDe = (aspecto: AspectoFoto): { ancho: number; alto: number } => {
  const [ancho, alto] = MEDIDAS[aspecto]
  return { ancho, alto }
}

export type Plantilla = {
  readonly nombre: string
  readonly descripcion: string
  readonly posicion: PosicionTexto
  /** degradado: se funde con la foto; solido: un panel liso detrás de todo el texto. */
  readonly estilo: EstiloPlaca
  readonly fondoSugerido?: IdFondo
}

/** Cómo se llaman en pantalla los dos controles que componen un diseño. */
export const ESTILOS: Record<EstiloPlaca, { nombre: string; descripcion: string }> = {
  degradado: { nombre: 'Degradado', descripcion: 'El texto sobre un degradado oscuro que se funde con la foto.' },
  solido: { nombre: 'Panel liso', descripcion: 'Un panel liso con todos los datos. Queda mejor con fondo de estudio.' },
}
export const POSICIONES: Record<PosicionTexto, { nombre: string; descripcion: string }> = {
  arriba: { nombre: 'Arriba', descripcion: 'El texto en la parte de arriba.' },
  abajo: { nombre: 'Abajo', descripcion: 'El texto en la parte de abajo.' },
  costado: { nombre: 'Al costado', descripcion: 'El texto en una mitad, del lado opuesto a la moto.' },
}

const plantilla = (id: IdPlantilla): Plantilla => {
  const estilo = estiloDe(id)
  const posicion = posicionTextoDe(id)
  return {
    nombre: `${ESTILOS[estilo].nombre} · ${POSICIONES[posicion].nombre.toLowerCase()}`,
    descripcion: `${ESTILOS[estilo].descripcion} ${POSICIONES[posicion].descripcion}`,
    posicion,
    estilo,
    ...(estilo === 'solido' ? { fondoSugerido: 'fondo_estudio' as const } : {}),
  }
}

export const PLANTILLAS: Record<IdPlantilla, Plantilla> = {
  oferta_abajo: plantilla('oferta_abajo'),
  oferta_arriba: plantilla('oferta_arriba'),
  oferta_costado: plantilla('oferta_costado'),
  catalogo: plantilla('catalogo'),
  catalogo_arriba: plantilla('catalogo_arriba'),
  catalogo_costado: plantilla('catalogo_costado'),
}

/** Las dos fuentes (OFL) que se commitean en assets/fuentes. `ancho` = ancho medio de un carácter / tamaño. */
export const FUENTES = {
  titulo: { nombre: 'Anton', archivo: 'Anton-Regular.ttf', peso: 400, ancho: 0.5, interlineado: 1.15 },
  texto: { nombre: 'Inter', archivo: 'Inter-SemiBold.otf', peso: 600, ancho: 0.6, interlineado: 1.25 },
} as const

export type TextosPlaca = {
  marca: string
  modelo: string
  /** Ya formateado: "$ 4.500.000". Sale del dato cargado, nunca de un modelo de lenguaje. */
  precio: string
  /** Vacío si la promoción es "ninguna" y no hay detalle. */
  promo: string
  titular: string
  /** Una línea más que escribe la persona ("Hot Sale · Solo este fin de semana"). Vacía si no puso nada. */
  extra: string
  lugar: string
}
export type Campo = keyof TextosPlaca

/** Cómo se nombra cada campo en el aviso "El texto … es muy largo para este diseño.". */
const ETIQUETAS: Record<Campo, string> = {
  marca: 'de la marca',
  modelo: 'del modelo',
  precio: 'del precio',
  promo: 'de la promoción',
  titular: 'del titular',
  extra: 'de la línea extra',
  lugar: 'del lugar',
}

export class ErrorTextoLargo extends Error {
  override name = 'ErrorTextoLargo'
  readonly campo: Campo
  constructor(campo: Campo) {
    super(`El texto ${ETIQUETAS[campo]} es muy largo para este diseño.`)
    this.campo = campo
  }
}

export type Layout = {
  ancho: number
  alto: number
  zona: ZonaTexto
  estilo: Plantilla['estilo']
  /** Alto del bloque de texto (y del panel, si es sólido). Al costado, todo el alto. */
  bandaAlto: number
  /** Ancho del bloque de texto. Arriba y abajo, todo el ancho; al costado, la mitad. */
  bandaAncho: number
  /** Extra del degradado, que se funde con la foto (alto arriba/abajo, ancho al costado). */
  fundido: number
  padX: number
  padY: number
  /** Ancho útil para el texto. */
  anchoTexto: number
  /** Separación base entre campos (se escala junto con las letras). */
  separacion: number
}

/** Parte del alto que ocupa el bloque de texto: más chica en 9:16, que ya es alta. */
const FRACCION_BANDA: Record<AspectoFoto, number> = { '1:1': 0.48, '4:5': 0.42, '9:16': 0.32 }
/** Al costado el texto ocupa la mitad del ancho; la moto va en la otra. */
const FRACCION_LADO = 0.5

export const esLateral = (zona: ZonaTexto): boolean => zona === 'izquierda' || zona === 'derecha'

/** La moto solo importa cuando el texto va al costado: define de qué lado queda. */
export function layoutDe(plantilla: IdPlantilla, aspecto: AspectoFoto, moto: PosicionMoto = 'centro'): Layout {
  const { ancho, alto } = medidasDe(aspecto)
  const estilo = PLANTILLAS[plantilla].estilo
  const zona = zonaDe(plantilla, moto)
  const lateral = esLateral(zona)
  const padX = lateral ? 48 : 64
  const bandaAncho = lateral ? Math.round(ancho * FRACCION_LADO) : ancho
  return {
    ancho,
    alto,
    zona,
    estilo,
    bandaAlto: lateral ? alto : Math.round(alto * FRACCION_BANDA[aspecto]),
    bandaAncho,
    fundido: estilo === 'degradado' ? (lateral ? 120 : 160) : 0,
    padX,
    padY: 48,
    anchoTexto: bandaAncho - 2 * padX,
    separacion: 14,
  }
}

/** Cuánto entra en cada campo que escribe la persona (el contador de la pantalla). El ancho es 1080 en los tres formatos. */
export const LIMITES_TEXTO: Record<'horizontal' | 'lateral', { titular: number; extra: number }> = {
  horizontal: { titular: 40, extra: 60 },
  lateral: { titular: 28, extra: 36 },
}
export const limitesTexto = (posicion: PosicionTexto): { titular: number; extra: number } => LIMITES_TEXTO[posicion === 'costado' ? 'lateral' : 'horizontal']

export type OpcionesAjuste = { base: number; min: number; ancho: number; factor: number; lineas: number }

/**
 * Cuánto se puede agrandar la letra sin que el texto se salga: primero se parte en
 * hasta `lineas` líneas y recién después se achica. null = ni en el mínimo entra.
 */
export function ajustarTexto(texto: string, o: OpcionesAjuste): { tam: number; lineas: number } | null {
  const n = texto.length
  if (n === 0) return { tam: o.base, lineas: 0 }
  const porLinea = (tam: number) => Math.max(1, Math.floor(o.ancho / (tam * o.factor)))
  const lineasNecesarias = (tam: number) => Math.ceil(n / porLinea(tam))
  for (let tam = o.base; tam >= o.min; tam -= 1) {
    const l = lineasNecesarias(tam)
    if (l <= o.lineas) return { tam, lineas: l }
  }
  return null
}

type Regla = { fuente: keyof typeof FUENTES; base: number; min: number; lineas: number; factor?: number }

/** Tamaños de partida y mínimos (px sobre 1080 de ancho). */
const REGLAS: Record<Campo, Regla> = {
  marca: { fuente: 'texto', base: 30, min: 20, lineas: 1, factor: 0.68 },
  modelo: { fuente: 'titulo', base: 92, min: 52, lineas: 1 },
  precio: { fuente: 'titulo', base: 140, min: 84, lineas: 1 },
  promo: { fuente: 'texto', base: 44, min: 28, lineas: 2 },
  titular: { fuente: 'texto', base: 40, min: 26, lineas: 2 },
  // En mayúsculas y con tracking: ocupa más que el texto común.
  extra: { fuente: 'texto', base: 32, min: 22, lineas: 1, factor: 0.72 },
  lugar: { fuente: 'texto', base: 28, min: 20, lineas: 1 },
}

/** Al costado la columna es angosta: menos tamaño mínimo y más líneas para que entre lo mismo. */
const REGLAS_LATERAL: Record<Campo, Regla> = {
  marca: { fuente: 'texto', base: 28, min: 18, lineas: 2, factor: 0.68 },
  modelo: { fuente: 'titulo', base: 84, min: 44, lineas: 1 },
  precio: { fuente: 'titulo', base: 112, min: 56, lineas: 1 },
  promo: { fuente: 'texto', base: 40, min: 24, lineas: 3 },
  titular: { fuente: 'texto', base: 40, min: 26, lineas: 2 },
  extra: { fuente: 'texto', base: 30, min: 20, lineas: 2, factor: 0.72 },
  lugar: { fuente: 'texto', base: 28, min: 20, lineas: 2 },
}

/** Orden de arriba hacia abajo en la placa. */
export const ORDEN: readonly Campo[] = ['marca', 'modelo', 'precio', 'promo', 'titular', 'extra', 'lugar']

/** Por debajo de esta escala la letra queda demasiado chica: se pide acortar. */
const ESCALA_MINIMA = 0.62

export type AjusteTextos = Record<Campo, { tam: number; lineas: number }> & {
  /** Alto total del bloque de texto, con separaciones. */
  alturaTotal: number
  /** Separación entre campos ya escalada. */
  separacion: number
}

/**
 * Tamaño final de cada texto. Si algo no entra ni en su mínimo, o el bloque no cabe en
 * la banda ni achicando todo un 38 %, lanza ErrorTextoLargo (la pantalla lo muestra).
 */
export function ajustarTextos(textos: TextosPlaca, plantilla: IdPlantilla, aspecto: AspectoFoto, moto: PosicionMoto = 'centro'): AjusteTextos {
  const l = layoutDe(plantilla, aspecto, moto)
  const reglas = esLateral(l.zona) ? REGLAS_LATERAL : REGLAS
  const fit = {} as Record<Campo, { tam: number; lineas: number }>
  for (const campo of ORDEN) {
    const r = reglas[campo]
    const f = FUENTES[r.fuente]
    const ajustado = ajustarTexto(textos[campo].trim(), { base: r.base, min: r.min, ancho: l.anchoTexto, factor: r.factor ?? f.ancho, lineas: r.lineas })
    if (!ajustado) throw new ErrorTextoLargo(campo)
    fit[campo] = ajustado
  }

  const alto = (e: Record<Campo, { tam: number; lineas: number }>, sep: number) => {
    const visibles = ORDEN.filter((c) => e[c].lineas > 0)
    const letras = visibles.reduce((suma, c) => suma + e[c].tam * FUENTES[reglas[c].fuente].interlineado * e[c].lineas, 0)
    return Math.ceil(letras + sep * Math.max(0, visibles.length - 1))
  }

  const disponible = l.bandaAlto - 2 * l.padY
  const total = alto(fit, l.separacion)
  if (total <= disponible) return { ...fit, alturaTotal: total, separacion: l.separacion }

  const escala = disponible / total
  if (escala < ESCALA_MINIMA) throw new ErrorTextoLargo(fit.titular.lineas >= fit.promo.lineas ? 'titular' : 'promo')
  const chico = {} as Record<Campo, { tam: number; lineas: number }>
  for (const c of ORDEN) chico[c] = { tam: Math.floor(fit[c].tam * escala), lineas: fit[c].lineas }
  const separacion = Math.floor(l.separacion * escala)
  return { ...chico, alturaTotal: alto(chico, separacion), separacion }
}
