/**
 * Validación del pedido de un lote (ADR-032): POST /api/tandas con tipo 'motos' o 'textos'.
 * Es la única puerta de lo que llega del navegador. Reusa los validadores de una promoción
 * suelta (validarModelo, validarDatos, validarTitular, validarLineaExtra) para que un lote
 * y una promoción acepten exactamente los mismos datos. Los mensajes van en castellano.
 */

import { UUID } from '../../agentes/http.ts'
import { Ctx, esObj, type Validacion } from '../../agentes/validar.ts'
import { ordenarMarcas } from '../../datos/marcas.ts'
import { esAspectoFoto, type AspectoFoto } from '../../productor/ediciones.ts'
import { validarDatos, validarLineaExtra, validarModelo, validarTitular } from '../datos.ts'
import type { DatosPromocion } from '../tipos.ts'
import { LIMITES_LOTE } from './tipos.ts'

export type MotoDelLote = { fotoId: string; modelo: string; datos: DatosPromocion }
export type VarianteDelLote = { titular: string; lineaExtra: string | null; datos: DatosPromocion }

export type PedidoLoteMotos = {
  tipo: 'motos'
  /** Distintas y en el orden de MARCAS. */
  marcaIds: string[]
  aspecto: AspectoFoto
  motos: MotoDelLote[]
}

export type PedidoLoteTextos = {
  tipo: 'textos'
  marcaIds: [string]
  fotoId: string
  modelo: string
  aspecto: AspectoFoto
  variantes: VarianteDelLote[]
}

export type PedidoLote = PedidoLoteMotos | PedidoLoteTextos

const sobran = (c: Ctx, x: Record<string, unknown>, permitidas: readonly string[], prefijo = '') => {
  for (const k of Object.keys(x)) if (!permitidas.includes(k)) c.err(`${prefijo}El campo "${k}" no está permitido.`)
}

/** Los errores de un ítem llevan su posición ("Moto 2: ...") para que la pantalla diga cuál. */
const conPrefijo = (c: Ctx, prefijo: string, errores: readonly string[]) => c.errores.push(...errores.map((e) => `${prefijo}: ${e}`))

function validarMarcas(c: Ctx, x: unknown, min: number, max: number): string[] {
  const crudas = Array.isArray(x) ? x : null
  const validas = crudas ? ordenarMarcas(crudas.filter((m): m is string => typeof m === 'string')) : []
  if (!crudas || validas.length !== crudas.length || validas.length < min || validas.length > max) {
    c.err(min === max ? 'Elegí una sola marca.' : `Elegí entre ${min} y ${max} marcas distintas.`)
  }
  return validas
}

function validarMotos(c: Ctx, x: unknown, comunes: { lugar?: unknown; indicaciones?: unknown }): MotoDelLote[] {
  const lista = c.lista(x, 'motos', LIMITES_LOTE.MOTOS_MIN, LIMITES_LOTE.MOTOS)
  const motos: MotoDelLote[] = []
  lista.forEach((m, i) => {
    const p = `Moto ${i + 1}`
    if (!esObj(m)) return c.err(`${p}: tiene que ser un objeto.`)
    const ic = new Ctx('moto')
    sobran(ic, m, ['fotoId', 'modelo', 'precio', 'promo'])
    const fotoId = typeof m.fotoId === 'string' && UUID.test(m.fotoId) ? m.fotoId : null
    if (!fotoId) ic.err('Falta la foto.')
    const modelo = validarModelo(m.modelo)
    if (!modelo.ok) ic.errores.push(...modelo.errores)
    const datos = validarDatos({ precio: m.precio, promo: m.promo, lugar: comunes.lugar, indicaciones: comunes.indicaciones })
    if (!datos.ok) ic.errores.push(...datos.errores)
    if (ic.errores.length > 0 || !fotoId || !modelo.ok || !datos.ok) return conPrefijo(c, p, ic.errores)
    motos.push({ fotoId, modelo: modelo.modelo, datos: datos.datos })
  })
  return motos
}

function validarVariantes(c: Ctx, x: unknown, base: DatosPromocion | null): VarianteDelLote[] {
  const lista = c.lista(x, 'variantes', LIMITES_LOTE.TEXTOS_MIN, LIMITES_LOTE.TEXTOS)
  const variantes: VarianteDelLote[] = []
  if (!base) return variantes
  lista.forEach((v, i) => {
    const p = `Variante ${i + 1}`
    if (!esObj(v)) return c.err(`${p}: tiene que ser un objeto.`)
    const ic = new Ctx('variante')
    sobran(ic, v, ['titular', 'lineaExtra', 'precio', 'promo'])
    const titular = validarTitular(v.titular)
    if (!titular.ok) ic.errores.push(...titular.errores)
    // Sin precio o promo propios, la variante hereda los del pedido.
    const datos = validarDatos({ precio: v.precio ?? base.precio, promo: v.promo ?? base.promo, lugar: base.lugar, indicaciones: base.indicaciones })
    if (!datos.ok) ic.errores.push(...datos.errores)
    // La línea extra se valida contra los montos de ESTA variante.
    const linea = datos.ok ? validarLineaExtra(v.lineaExtra, datos.datos) : { ok: true as const, linea: null }
    if (!linea.ok) ic.errores.push(...linea.errores)
    if (ic.errores.length > 0 || !titular.ok || !datos.ok || !linea.ok) return conPrefijo(c, p, ic.errores)
    variantes.push({ titular: titular.titular, lineaExtra: linea.linea, datos: datos.datos })
  })
  // Dos textos que no se distinguen no tienen sentido: se pagaría revisar lo mismo dos veces.
  const clave = (v: VarianteDelLote) => JSON.stringify([v.titular, v.lineaExtra, v.datos.promo, v.datos.precio])
  if (variantes.length === lista.length) {
    variantes.forEach((v, j) => {
      const i = variantes.findIndex((o) => clave(o) === clave(v))
      if (i !== j) c.err(`Las variantes ${i + 1} y ${j + 1} son iguales.`)
    })
  }
  return variantes
}

export function validarPedidoLote(x: unknown): Validacion<PedidoLote, 'pedido'> {
  const c = new Ctx('pedido')
  if (!esObj(x)) return { ok: false, errores: ['El pedido tiene que ser un objeto.'] }
  if (x.tipo !== 'motos' && x.tipo !== 'textos') return { ok: false, errores: ['El tipo de lote tiene que ser "motos" o "textos".'] }

  if (x.tipo === 'motos') {
    sobran(c, x, ['tipo', 'marcaIds', 'aspecto', 'lugar', 'indicaciones', 'motos'])
    const marcaIds = validarMarcas(c, x.marcaIds, 1, LIMITES_LOTE.MARCAS)
    if (!esAspectoFoto(x.aspecto)) c.err('Elegí un formato: 1:1, 4:5 o 9:16.')
    const motos = validarMotos(c, x.motos, x)
    const placas = motos.length * marcaIds.length
    if (c.errores.length === 0 && placas > LIMITES_LOTE.PLACAS) {
      c.err(`Son ${placas} placas: el máximo por lote es ${LIMITES_LOTE.PLACAS}. Sacá motos o marcas.`)
    }
    if (c.errores.length > 0) return { ok: false, errores: c.errores }
    return { ok: true, pedido: { tipo: 'motos', marcaIds, aspecto: x.aspecto as AspectoFoto, motos } }
  }

  sobran(c, x, ['tipo', 'marcaIds', 'fotoId', 'modelo', 'aspecto', 'precio', 'promo', 'lugar', 'indicaciones', 'variantes'])
  const marcaIds = validarMarcas(c, x.marcaIds, 1, 1)
  const fotoId = typeof x.fotoId === 'string' && UUID.test(x.fotoId) ? x.fotoId : null
  if (!fotoId) c.err('Falta la foto.')
  const modelo = validarModelo(x.modelo)
  if (!modelo.ok) c.errores.push(...modelo.errores)
  if (!esAspectoFoto(x.aspecto)) c.err('Elegí un formato: 1:1, 4:5 o 9:16.')
  const base = validarDatos({ precio: x.precio, promo: x.promo, lugar: x.lugar, indicaciones: x.indicaciones })
  if (!base.ok) c.errores.push(...base.errores)
  const variantes = validarVariantes(c, x.variantes, base.ok ? base.datos : null)
  if (c.errores.length > 0 || !fotoId || !modelo.ok) return { ok: false, errores: c.errores }
  return { ok: true, pedido: { tipo: 'textos', marcaIds: [marcaIds[0]!], fotoId, modelo: modelo.modelo, aspecto: x.aspecto as AspectoFoto, variantes } }
}
