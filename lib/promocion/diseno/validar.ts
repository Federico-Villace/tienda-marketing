/**
 * Validación de promociones.diseno (R2). El servidor es la autoridad: el navegador valida lo mismo
 * solo para avisar antes. Lo que se escribe en la placa no puede tener dinero (salvo el precio cargado),
 * emojis (satori no los dibuja), ni teléfonos o emails (la gente escribe por mensaje).
 */

import type { Validacion } from '../../agentes/validar.ts'
import { fuenteMontosPlaca, tieneContacto, TIENE_EMOJI, validarTitular } from '../datos.ts'
import { MENSAJE_MONTOS, montosDeDineroEnTexto } from '../montos-placa.ts'
import type { DatosPromocion, IdPlantillaDiseno } from '../tipos.ts'
import { FUENTES_POR_ROL, ROLES_TEXTO, type IdFuente, type RolTexto } from '../fuentes-placa.ts'
import { acentosDe } from './paletas.ts'
import { CTAS, INCLINACIONES, LIMITES_DISENO, POSICIONES_FRASE, VARIACIONES_POR_PLANTILLA, type Acento, type Inclinacion, type Cta, type Diseno, type PosicionFrase } from './tipos.ts'

export type ContextoDiseno = {
  datos: DatosPromocion
  /** Ids de los logos de marca (rol 'marca-moto') de la concesionaria de la promoción. */
  logosMarca: readonly string[]
}

const CLAVES = ['acento', 'mostrarPrecio', 'condicion', 'cta', 'frase', 'lista', 'numero', 'tamanos', 'fuentes', 'inclinacion', 'variacion', 'posicionFrase', 'logoMarca'] as const
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

  if (x.fuentes !== undefined) {
    if (!esObj(x.fuentes)) errores.push('"fuentes" tiene que ser un objeto con modelo, frase y precio.')
    else {
      const f: Partial<Record<RolTexto, IdFuente>> = {}
      let ok = true
      for (const [k, v] of Object.entries(x.fuentes)) {
        if (!(ROLES_TEXTO as readonly string[]).includes(k)) (errores.push(`El campo "fuentes.${k}" no está permitido.`), (ok = false))
        else if (typeof v !== 'string' || !(FUENTES_POR_ROL[k as RolTexto] as readonly string[]).includes(v)) {
          errores.push(`"fuentes.${k}" tiene que ser una de: ${FUENTES_POR_ROL[k as RolTexto].join(', ')}.`)
          ok = false
        } else f[k as RolTexto] = v as IdFuente
      }
      if (ok) d.fuentes = f
    }
  }

  if (x.inclinacion !== undefined) {
    if (!esObj(x.inclinacion)) errores.push('"inclinacion" tiene que ser un objeto con modelo, frase y precio.')
    else {
      const g: Partial<Record<RolTexto, Inclinacion>> = {}
      let ok = true
      for (const [k, v] of Object.entries(x.inclinacion)) {
        if (!(ROLES_TEXTO as readonly string[]).includes(k)) (errores.push(`El campo "inclinacion.${k}" no está permitido.`), (ok = false))
        else if (typeof v !== 'number' || !(INCLINACIONES as readonly number[]).includes(v)) {
          errores.push(`"inclinacion.${k}" tiene que ser uno de: ${INCLINACIONES.join(', ')} (grados).`)
          ok = false
        } else g[k as RolTexto] = v as Inclinacion
      }
      if (ok) d.inclinacion = g
    }
  }

  if (x.variacion !== undefined) {
    const n = VARIACIONES_POR_PLANTILLA[plantilla]
    if (typeof x.variacion === 'number' && Number.isInteger(x.variacion) && x.variacion >= 0 && x.variacion < n) d.variacion = x.variacion
    else errores.push(`"variacion" tiene que ser un entero de 0 a ${n - 1}.`)
  }

  if (x.posicionFrase !== undefined) {
    if (plantilla === 'editorial') errores.push('La posicionFrase no aplica al diseño editorial.')
    else if (plantilla === 'referencia') errores.push('La posicionFrase no aplica al diseño de la referencia: el lugar de la frase lo marca la referencia.')
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

/** Al cambiar de plantilla: la variación que la nueva no tiene (`cuantas` = cuántas tiene; por defecto las de VARIACIONES_POR_PLANTILLA) se descarta; el resto del diseño sigue. */
export function sinVariacionFueraDeRango(diseno: Diseno, plantilla: IdPlantillaDiseno, cuantas: number = VARIACIONES_POR_PLANTILLA[plantilla]): Diseno {
  if (diseno.variacion === undefined || (Number.isInteger(diseno.variacion) && diseno.variacion >= 0 && diseno.variacion < cuantas)) return diseno
  const { variacion: _descartada, ...resto } = diseno
  return resto
}
