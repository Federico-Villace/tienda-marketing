/**
 * Validación y formato de los datos de una promoción (paso 1). Es la ÚNICA puerta
 * de lo que la persona carga: el servidor no confía en el navegador.
 *
 * El precio es un dato, jamás se reescribe: el monto tiene que llegar como número
 * entero (un "4.500.000" en texto o un decimal se rechaza, no se redondea) y es
 * lo que después se dibuja en la placa. Los mensajes van en castellano porque
 * llegan a la pantalla.
 */

import { Ctx, EMAIL, TELEFONO, esObj, type Validacion } from '../agentes/validar.ts'
import { hashJson } from '../agentes/hash.ts'
import { MONTO } from '../contenidista/montos.ts'
import { MARCAS } from '../datos/marcas.ts'
import { esAspectoFoto, type AspectoFoto } from '../productor/ediciones.ts'
import { UUID } from '../agentes/http.ts'
import { MONEDAS, TIPOS_PROMO, type DatosPromocion, type Precio, type TipoPromo } from './tipos.ts'

export const LIMITES_PROMOCION = {
  MODELO_MIN: 2,
  MODELO: 60,
  DETALLE: 80,
  LUGAR: 60,
  INDICACIONES: 500,
  MONTO_ARS: 999_999_999,
  MONTO_USD: 9_999_999,
} as const

export const LUGAR_POR_DEFECTO = 'Quilmes'

/** satori no dibuja emojis sin bajarlos de un CDN: no entran en lo que va a la placa. */
export const TIENE_EMOJI = /\p{Extended_Pictographic}/u

/** Se saca el monto antes de buscar teléfonos: "$ 12.500.000" tiene 8 dígitos y no es un contacto. */
const tieneContacto = (t: string) => EMAIL.test(t) || TELEFONO.test(t.replace(MONTO, ' '))

/** "4500000" → "4.500.000". Sin Intl: no depende de los datos de locale del servidor. */
const conMiles = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

export function formatearPrecio(p: Precio): string {
  return `${p.moneda === 'USD' ? 'US$' : '$'} ${conMiles(p.monto)}`
}

const ETIQUETA: Record<TipoPromo, string> = {
  contado: 'Contado',
  cuotas: 'Cuotas',
  credito: 'Crédito',
  oferta: 'Oferta',
  ninguna: '',
}

/** La línea de promo de la placa: el detalle que escribió la persona o, si no hay, el nombre del tipo. */
export const lineaPromo = (promo: DatosPromocion['promo']): string => promo.detalle || ETIQUETA[promo.tipo]

/** Lo que respalda un monto en los textos del redactor: el precio cargado SÍ es una fuente. */
export function fuenteMontos(d: DatosPromocion): string {
  return [formatearPrecio(d.precio), String(d.precio.monto), d.promo.detalle, d.indicaciones].filter(Boolean).join('\n')
}

export const hashDatos = (d: DatosPromocion): string => hashJson(d)

export function validarModelo(x: unknown): { ok: true; modelo: string } | { ok: false; errores: string[] } {
  const c = new Ctx('pedido')
  const modelo = c.texto(x, 'modelo', LIMITES_PROMOCION.MODELO_MIN, LIMITES_PROMOCION.MODELO)
  if (TIENE_EMOJI.test(modelo)) c.err('El modelo no puede llevar emojis.')
  return c.errores.length > 0 ? { ok: false, errores: c.errores } : { ok: true, modelo }
}

function validarPrecio(c: Ctx, x: unknown): Precio | null {
  if (!esObj(x)) {
    c.err('Falta el precio.')
    return null
  }
  for (const k of Object.keys(x)) if (k !== 'moneda' && k !== 'monto') c.err(`El campo "precio.${k}" no está permitido.`)
  const moneda = x.moneda
  if (moneda !== 'ARS' && moneda !== 'USD') {
    c.err(`La moneda tiene que ser ${MONEDAS.join(' o ')}.`)
    return null
  }
  const tope = moneda === 'USD' ? LIMITES_PROMOCION.MONTO_USD : LIMITES_PROMOCION.MONTO_ARS
  const monto = x.monto
  if (typeof monto !== 'number' || !Number.isInteger(monto) || monto < 1 || monto > tope) {
    c.err(`El precio tiene que ser un número entero entre 1 y ${conMiles(tope)}, sin puntos ni símbolos.`)
    return null
  }
  return { moneda, monto }
}

function validarPromo(c: Ctx, x: unknown): DatosPromocion['promo'] | null {
  if (!esObj(x)) {
    c.err('Falta la promoción (aunque sea "ninguna").')
    return null
  }
  for (const k of Object.keys(x)) if (k !== 'tipo' && k !== 'detalle') c.err(`El campo "promo.${k}" no está permitido.`)
  const tipo = x.tipo
  if (typeof tipo !== 'string' || !(TIPOS_PROMO as readonly string[]).includes(tipo)) {
    c.err(`El tipo de promoción tiene que ser uno de: ${TIPOS_PROMO.join(', ')}.`)
    return null
  }
  const detalle = x.detalle === undefined ? '' : c.texto(x.detalle, 'promo.detalle', 0, LIMITES_PROMOCION.DETALLE)
  if (TIENE_EMOJI.test(detalle)) c.err('El detalle de la promoción no puede llevar emojis.')
  if (tieneContacto(detalle)) c.err('El detalle de la promoción no puede llevar emails ni teléfonos: la gente escribe por mensaje.')
  return { tipo: tipo as TipoPromo, detalle }
}

/** Lugar e indicaciones son opcionales; el lugar vacío queda en Quilmes. */
function validarResto(c: Ctx, x: Record<string, unknown>): { lugar: string; indicaciones: string } {
  const lugarCrudo = x.lugar === undefined ? '' : c.texto(x.lugar, 'lugar', 0, LIMITES_PROMOCION.LUGAR)
  if (TIENE_EMOJI.test(lugarCrudo)) c.err('El lugar no puede llevar emojis.')
  const indicaciones = x.indicaciones === undefined ? '' : c.texto(x.indicaciones, 'indicaciones', 0, LIMITES_PROMOCION.INDICACIONES)
  return { lugar: lugarCrudo || LUGAR_POR_DEFECTO, indicaciones }
}

const sobran = (c: Ctx, x: Record<string, unknown>, permitidas: readonly string[]) => {
  for (const k of Object.keys(x)) if (!permitidas.includes(k)) c.err(`El campo "${k}" no está permitido.`)
}

/** El objeto `datos` de una promoción: precio, promo, lugar e indicaciones. */
export function validarDatos(x: unknown): Validacion<DatosPromocion, 'datos'> {
  const c = new Ctx('datos')
  if (!esObj(x)) return { ok: false, errores: ['Los datos de la promoción tienen que ser un objeto.'] }
  sobran(c, x, ['precio', 'promo', 'lugar', 'indicaciones'])
  const precio = validarPrecio(c, x.precio)
  const promo = validarPromo(c, x.promo)
  const resto = validarResto(c, x)
  if (c.errores.length > 0 || !precio || !promo) return { ok: false, errores: c.errores }
  return { ok: true, datos: { precio, promo, ...resto } }
}

export type PedidoPromocion = {
  marcaId: string
  modelo: string
  datos: DatosPromocion
  fotoId: string
  aspecto: AspectoFoto
}

/** POST /api/promociones: { marcaId, modelo, precio, promo, lugar?, indicaciones?, fotoId, aspecto }. */
export function validarPedido(x: unknown): Validacion<PedidoPromocion, 'pedido'> {
  const c = new Ctx('pedido')
  if (!esObj(x)) return { ok: false, errores: ['El pedido tiene que ser un objeto.'] }
  sobran(c, x, ['marcaId', 'modelo', 'precio', 'promo', 'lugar', 'indicaciones', 'fotoId', 'aspecto'])

  const marcaId = typeof x.marcaId === 'string' && MARCAS.some((m) => m.id === x.marcaId) ? x.marcaId : null
  if (!marcaId) c.err('Elegí una de las marcas.')
  const m = validarModelo(x.modelo)
  if (!m.ok) c.errores.push(...m.errores)
  const fotoId = typeof x.fotoId === 'string' && UUID.test(x.fotoId) ? x.fotoId : null
  if (!fotoId) c.err('Falta la foto.')
  if (!esAspectoFoto(x.aspecto)) c.err('Elegí un formato: 1:1, 4:5 o 9:16.')

  const precio = validarPrecio(c, x.precio)
  const promo = validarPromo(c, x.promo)
  const resto = validarResto(c, x)

  if (c.errores.length > 0 || !marcaId || !m.ok || !fotoId || !precio || !promo) return { ok: false, errores: c.errores }
  return {
    ok: true,
    pedido: { marcaId, modelo: m.modelo, fotoId, aspecto: x.aspecto as AspectoFoto, datos: { precio, promo, ...resto } },
  }
}

/** El titular va grande en la placa y el precio va aparte: sin montos ni números. */
export function validarTitular(x: unknown): { ok: true; titular: string } | { ok: false; errores: string[] } {
  const c = new Ctx('pedido')
  const titular = c.texto(x, 'titular', 1, 40)
  if (TIENE_EMOJI.test(titular)) c.err('El titular no puede llevar emojis.')
  if (/\d/.test(titular)) c.err('El titular no lleva precios ni números: el precio va aparte, en la imagen.')
  return c.errores.length > 0 ? { ok: false, errores: c.errores } : { ok: true, titular }
}
