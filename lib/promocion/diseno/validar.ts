/**
 * Validación de promociones.diseno (R2). El servidor es la autoridad: el navegador valida lo mismo
 * solo para avisar antes. Lo que se escribe en la placa no puede tener dinero (salvo el precio cargado),
 * emojis (satori no los dibuja), ni teléfonos o emails (la gente escribe por mensaje).
 */

import type { Validacion } from '../../agentes/validar.ts'
import { fuenteMontosPlaca, tieneContacto, TIENE_EMOJI, validarTitular } from '../datos.ts'
import { MENSAJE_MONTOS, montosDeDineroEnTexto } from '../montos-placa.ts'
import type { DatosPromocion, IdPlantillaDiseno } from '../tipos.ts'
import { acentosDe } from './paletas.ts'
import { CTAS, LIMITES_DISENO, POSICIONES_FRASE, type Acento, type Cta, type Diseno, type PosicionFrase } from './tipos.ts'

export type ContextoDiseno = {
  datos: DatosPromocion
  /** Ids de los logos de marca (rol 'marca-moto') de la concesionaria de la promoción. */
  logosMarca: readonly string[]
}

const CLAVES = ['acento', 'mostrarPrecio', 'condicion', 'cta', 'frase', 'lista', 'numero', 'tamanos', 'posicionFrase', 'logoMarca'] as const
const CLAVES_TAMANO = ['modelo', 'frase', 'precio'] as const
const esObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

export function validarDiseno(x: unknown, plantilla: IdPlantillaDiseno, ctx: ContextoDiseno): Validacion<Diseno | null, 'diseno'> {
  if (x === null || x === undefined) return { ok: true, diseno: null }
  if (!esObj(x)) return { ok: false, errores: ['El diseño tiene que ser un objeto.'] }
  const errores: string[] = []
  const d: Diseno = {}
  const fuente = fuenteMontosPlaca(ctx.datos)

  /** Texto que se dibuja: sin emojis, sin contactos y sin dinero (salvo el precio cargado). */
  const textoLimpio = (t: string, nombre: string): boolean => {
    let ok = true
    if (TIENE_EMOJI.test(t)) (errores.push(`"${nombre}" no puede llevar emojis.`), (ok = false))
    if (tieneContacto(t)) (errores.push(`"${nombre}" no puede llevar emails ni teléfonos: la gente escribe por mensaje.`), (ok = false))
    if (montosDeDineroEnTexto(t, fuente).length > 0) (errores.push(`"${nombre}": ${MENSAJE_MONTOS}`), (ok = false))
    return ok
  }

  for (const k of Object.keys(x)) if (!(CLAVES as readonly string[]).includes(k)) errores.push(`El campo "${k}" no está permitido.`)

  if (x.acento !== undefined) {
    if (typeof x.acento === 'string' && (acentosDe(plantilla) as string[]).includes(x.acento)) d.acento = x.acento as Acento
    else errores.push(`El acento tiene que ser uno de: ${acentosDe(plantilla).join(', ')}.`)
  }

  if (x.mostrarPrecio !== undefined) {
    if (typeof x.mostrarPrecio === 'boolean') d.mostrarPrecio = x.mostrarPrecio
    else errores.push('"mostrarPrecio" tiene que ser verdadero o falso.')
  }

  if (x.condicion !== undefined) {
    const c = x.condicion
    if (!esObj(c)) errores.push('"condicion" tiene que ser un objeto con texto y destacado.')
    else {
      let ok = true
      for (const k of Object.keys(c)) if (k !== 'texto' && k !== 'destacado') (errores.push(`El campo "condicion.${k}" no está permitido.`), (ok = false))
      for (const [k, max] of [['texto', LIMITES_DISENO.CONDICION_TEXTO], ['destacado', LIMITES_DISENO.CONDICION_DESTACADO]] as const) {
        const v = c[k]
        if (typeof v !== 'string') (errores.push(`Falta "condicion.${k}" (puede ir vacío).`), (ok = false))
        else if (v.trim().length > max) (errores.push(`"condicion.${k}" admite hasta ${max} caracteres.`), (ok = false))
        else if (!textoLimpio(v, `condicion.${k}`)) ok = false
      }
      if (ok) d.condicion = { texto: (c.texto as string).trim(), destacado: (c.destacado as string).trim() }
    }
  }

  if (x.cta !== undefined) {
    if (typeof x.cta === 'string' && (CTAS as readonly string[]).includes(x.cta)) d.cta = x.cta as Cta
    else errores.push(`El cta tiene que ser uno de: ${CTAS.join(', ')}.`)
  }

  if (x.frase !== undefined && x.frase !== null) {
    const t = validarTitular(x.frase, LIMITES_DISENO.FRASE)
    if (t.ok) d.frase = t.titular
    else errores.push(...t.errores.map((e) => e.replace(/"titular"/g, '"frase"').replace(/titular/g, 'frase')))
  }

  if (x.lista !== undefined) {
    if (plantilla !== 'editorial') errores.push('La lista lateral es solo del diseño editorial.')
    else if (!Array.isArray(x.lista) || x.lista.length > LIMITES_DISENO.LISTA_ITEMS) errores.push(`La lista admite hasta ${LIMITES_DISENO.LISTA_ITEMS} palabras.`)
    else {
      const items = x.lista as unknown[]
      let ok = true
      for (const it of items) {
        if (typeof it !== 'string' || it.trim() === '' || it.trim().length > LIMITES_DISENO.LISTA_ITEM) {
          errores.push(`Cada palabra de la lista admite de 1 a ${LIMITES_DISENO.LISTA_ITEM} caracteres.`)
          ok = false
        } else if (!textoLimpio(it, 'lista')) ok = false
      }
      if (ok) d.lista = items.map((i) => (i as string).trim())
    }
  }

  if (x.numero !== undefined) {
    if (plantilla !== 'editorial') errores.push('El numero grande es solo del diseño editorial.')
    else if (typeof x.numero === 'string' && new RegExp(`^[A-Za-z0-9]{1,${LIMITES_DISENO.NUMERO}}$`).test(x.numero.trim())) d.numero = x.numero.trim()
    else errores.push(`El numero tiene que tener hasta ${LIMITES_DISENO.NUMERO} letras o dígitos, sin espacios.`)
  }

  if (x.tamanos !== undefined) {
    if (!esObj(x.tamanos)) errores.push('"tamanos" tiene que ser un objeto.')
    else {
      const t: Record<string, number> = {}
      let ok = true
      for (const [k, v] of Object.entries(x.tamanos)) {
        if (!(CLAVES_TAMANO as readonly string[]).includes(k)) (errores.push(`El campo "tamanos.${k}" no está permitido.`), (ok = false))
        else if (typeof v !== 'number' || !Number.isInteger(v) || v < LIMITES_DISENO.TAMANO_MIN || v > LIMITES_DISENO.TAMANO_MAX) {
          errores.push(`"tamanos.${k}" tiene que ser un entero de ${LIMITES_DISENO.TAMANO_MIN} a ${LIMITES_DISENO.TAMANO_MAX}.`)
          ok = false
        } else t[k] = v
      }
      if (ok) d.tamanos = t
    }
  }

  if (x.posicionFrase !== undefined) {
    if (plantilla === 'editorial') errores.push('La posicionFrase no aplica al diseño editorial.')
    else if (typeof x.posicionFrase === 'string' && (POSICIONES_FRASE as readonly string[]).includes(x.posicionFrase)) d.posicionFrase = x.posicionFrase as PosicionFrase
    else errores.push('La posicionFrase tiene que ser izquierda o derecha.')
  }

  if (x.logoMarca !== undefined) {
    if (x.logoMarca === null) d.logoMarca = null
    else if (typeof x.logoMarca === 'string' && ctx.logosMarca.includes(x.logoMarca)) d.logoMarca = x.logoMarca
    else errores.push('Ese logoMarca no existe para esta concesionaria.')
  }

  if (errores.length > 0) return { ok: false, errores }
  return { ok: true, diseno: Object.keys(d).length === 0 ? null : d }
}
