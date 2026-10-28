/**
 * De dónde sale cada dato de respaldo: dado un hecho ("Vistas promedio por publicación ·
 * plataforma instagram", muestra 30 publicaciones) reconstruye QUÉ publicaciones o
 * campañas hay detrás, para que la pantalla las pueda desplegar. Es solo para mostrar:
 * nada de esto va al LLM.
 *
 * Los hechos no guardan una referencia: se reconstruye leyendo su `que` (armarHechos
 * es quien lo escribe; el test de ida y vuelta vigila que sigan de acuerdo). Y por las
 * dudas, el conjunto reconstruido tiene que sumar EXACTAMENTE la muestra del hecho: si
 * no cierra (datos que cambiaron desde el análisis, nombres repetidos), no se ofrece.
 */

import type { CampaniaReal } from '../datos/publicidad.ts'
import type { Publicacion } from '../datos/tipos.ts'
import { diaSemanaAR } from '../datos/agregados.ts'
import { marcaPorId } from '../datos/marcas.ts'
import { interaccionesDe } from '../datos/tipos.ts'
import { fechaAR } from '../ingesta/transformar.ts'
import { corto, type Hecho } from './hechos.ts'

const MAX_TEXTO_FILA = 120

/** Una publicación lista para mostrar y serializable (va del servidor al navegador). */
export type PostFila = {
  readonly id: string
  readonly marca: string
  readonly plataforma: 'instagram' | 'facebook'
  readonly tipo: string
  /** Instante ISO: el navegador lo formatea en hora de Argentina. */
  readonly publicadoEn: string
  /** YYYY-MM-DD en hora de Argentina. */
  readonly fecha: string
  readonly texto: string
  readonly permalink: string | null
  readonly vistas: number
  readonly interacciones: number
}

export type CampaniaFila = {
  readonly id: string
  readonly nombre: string
  readonly gasto: number
  readonly impresiones: number
  readonly clics: number
  readonly resultados: number
}

export type Origen = { readonly publicaciones: readonly PostFila[]; readonly campanias: readonly CampaniaFila[] }

export type Conjunto =
  | { readonly tipo: 'publicaciones'; readonly filas: readonly PostFila[]; readonly unaSola: boolean }
  | { readonly tipo: 'campanias'; readonly filas: readonly CampaniaFila[] }

export const aPostFila = (p: Publicacion): PostFila => ({
  id: p.id,
  marca: marcaPorId(p.marcaId)?.nombre ?? '',
  plataforma: p.plataforma,
  tipo: p.tipo,
  publicadoEn: p.publicadoEn.toISOString(),
  fecha: fechaAR(p.publicadoEn.toISOString()) ?? '',
  texto: p.texto.slice(0, MAX_TEXTO_FILA),
  permalink: p.permalink,
  vistas: p.vistas,
  interacciones: interaccionesDe(p),
})

export const aCampaniaFila = (c: CampaniaReal): CampaniaFila => ({
  id: c.id,
  nombre: c.nombre,
  gasto: c.gasto,
  impresiones: c.impresiones,
  clics: c.clics,
  resultados: c.resultados,
})

const DE_TODAS_LAS_PUBLICACIONES = [
  'Publicaciones del período',
  'Vistas totales',
  'Vistas promedio por publicación',
  'Tasa de interacción del período',
  'Comentarios totales',
]
const DE_TODA_LA_PUBLICIDAD = ['Gasto publicitario total', 'Resultados de publicidad (mensajes y leads)', 'Costo por resultado de toda la publicidad', 'CTR de toda la publicidad']

const GRUPO = /^(?:Vistas promedio por publicación|Tasa de interacción) · (plataforma|formato|día de la semana|marca) (.+)$/
const POST_DESTACADO = /^(?:Mejor|Peor) publicación \((\S+) de (instagram|facebook)(?: de (.+))?, (\d{4}-\d{2}-\d{2})\) contra lo habitual de su cuenta$/
const CAMPANIA = [
  /^Gasto de la campaña sin mensajes ni leads "(.+)"$/,
  /^Gasto de la campaña "(.+)"$/,
  /^Costo por resultado de la campaña "(.+)"$/,
  /^(?:Mejor|Peor) campaña por .+: "(.+)"$/,
]

/** Lo que cuenta la muestra de un hecho, sumado sobre unas campañas. */
const sumaDe = (unidad: string, cs: readonly CampaniaFila[]): number | null => {
  const campo = ({ impresiones: 'impresiones', resultados: 'resultados', clics: 'clics' } as const)[unidad as 'impresiones']
  return campo ? cs.reduce((t, c) => t + c[campo], 0) : null
}

/** null = no se puede reconstruir con certeza (o el dato no sale de publicaciones ni campañas). */
export function conjuntoDeHecho(h: Hecho, o: Origen): Conjunto | null {
  const posts = (filas: readonly PostFila[], unaSola = false): Conjunto | null =>
    filas.length > 0 && (unaSola || (h.muestra?.unidad === 'publicaciones' && h.muestra.cantidad === filas.length))
      ? { tipo: 'publicaciones', filas, unaSola }
      : null
  const camps = (filas: readonly CampaniaFila[], validar = true): Conjunto | null => {
    if (filas.length === 0) return null
    if (validar && (!h.muestra || sumaDe(h.muestra.unidad, filas) !== h.muestra.cantidad)) return null
    return { tipo: 'campanias', filas }
  }

  if (DE_TODAS_LAS_PUBLICACIONES.includes(h.que) || h.que.startsWith('Alcance total') || h.que.startsWith('Clics totales')) {
    return posts(o.publicaciones)
  }

  const grupo = GRUPO.exec(h.que)
  if (grupo) {
    const [, rotulo, clave] = grupo
    const coincide = (p: PostFila): boolean =>
      rotulo === 'plataforma'
        ? p.plataforma === clave
        : rotulo === 'formato'
          ? p.tipo === clave
          : rotulo === 'marca'
            ? p.marca === clave
            : diaSemanaAR(new Date(p.publicadoEn)) === clave
    return posts(o.publicaciones.filter(coincide))
  }

  const destacado = POST_DESTACADO.exec(h.que)
  if (destacado) {
    const [, tipo, plataforma, marca, fecha] = destacado
    const filas = o.publicaciones.filter((p) => p.tipo === tipo && p.plataforma === plataforma && p.fecha === fecha && (!marca || p.marca === marca))
    return posts(filas, true)
  }

  if (DE_TODA_LA_PUBLICIDAD.includes(h.que)) return camps(o.campanias)

  for (const re of CAMPANIA) {
    const nombre = re.exec(h.que)?.[1]
    if (nombre !== undefined) return camps(o.campanias.filter((c) => corto(c.nombre) === nombre), h.muestra !== null)
  }
  return null
}
