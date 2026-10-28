/**
 * El contrato entre "Ideas para armar" del Analista y /promocionar/nueva: un link con
 * la idea en la query y la lectura validada del otro lado. Solo PRELLENA el formulario:
 * no crea ninguna promoción ni gasta nada hasta que la persona siga (regla #3).
 */

import { MARCAS } from '../datos/marcas.ts'
import { esAspectoFoto, type AspectoFoto } from '../productor/ediciones.ts'
import { TIPOS_PROMO, type TipoPromo } from '../promocion/tipos.ts'

export const MAX_MODELO = 60
export const MAX_INDICACIONES = 300

export type Precarga = {
  readonly origen: 'analista'
  readonly marcaIds?: readonly string[]
  readonly modelo?: string
  readonly tipo?: TipoPromo
  readonly aspecto?: AspectoFoto
  readonly indicaciones?: string
}

export type IdeaParaArmar = {
  readonly marcaId: string | null
  readonly modelo: string | null
  readonly tipoPromo: TipoPromo
  readonly aspecto: AspectoFoto
  readonly titulo: string
  readonly momento: string
}

export function hrefArmarPromocion(i: IdeaParaArmar): string {
  const q = new URLSearchParams({ que: 'una', origen: 'analista' })
  if (i.marcaId) q.set('marca', i.marcaId)
  if (i.modelo) q.set('modelo', i.modelo.slice(0, MAX_MODELO))
  q.set('promo', i.tipoPromo)
  q.set('aspecto', i.aspecto)
  q.set('indicaciones', `${i.momento}. ${i.titulo}`.slice(0, MAX_INDICACIONES))
  return `/promocionar/nueva?${q.toString()}`
}

type Param = string | readonly string[] | undefined
const primero = (v: Param): string | undefined => (typeof v === 'string' ? v : v?.[0])

/** Lo que llega por la URL es entrada no confiable: se valida campo por campo y lo inválido se ignora. */
export function leerPrecarga(p: Record<string, Param>): Precarga | null {
  if (primero(p.origen) !== 'analista') return null

  const marca = MARCAS.find((m) => m.id === primero(p.marca))
  const modelo = primero(p.modelo)?.trim().slice(0, MAX_MODELO)
  const tipo = TIPOS_PROMO.find((t) => t === primero(p.promo))
  const aspectoCrudo = primero(p.aspecto)
  const aspecto = esAspectoFoto(aspectoCrudo) ? aspectoCrudo : undefined
  const indicaciones = primero(p.indicaciones)?.trim().slice(0, MAX_INDICACIONES)

  const precarga: Precarga = {
    origen: 'analista',
    ...(marca ? { marcaIds: [marca.id] } : {}),
    ...(modelo ? { modelo } : {}),
    ...(tipo ? { tipo } : {}),
    ...(aspecto ? { aspecto } : {}),
    ...(indicaciones ? { indicaciones } : {}),
  }
  return Object.keys(precarga).length > 1 ? precarga : null
}
