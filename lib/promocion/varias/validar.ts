/**
 * Validación de las motos EXTRA de una placa de varias motos (ADR-041). Es la única puerta de lo que llega del navegador: reusa los
 * validadores de una promoción suelta (modelo, precio, promo) para que una moto de la placa acepte exactamente lo mismo que una promoción.
 * Los errores llevan la posición de la moto ("Moto 3: ..."): la principal es la 1 y la primera extra es la 2.
 */

import { UUID } from '../../agentes/http.ts'
import { Ctx, esObj, type Validacion } from '../../agentes/validar.ts'
import { validarDatos, validarModelo } from '../datos.ts'
import { LIMITES_VARIAS, type MotoExtra } from './tipos.ts'

const CLAVES = ['fotoId', 'modelo', 'precio', 'promo']

export function validarMotosExtra(x: unknown, o: { fotoPrincipalId: string | null }): Validacion<MotoExtra[], 'motos'> {
  const c = new Ctx('motos')
  if (!Array.isArray(x) || x.length < LIMITES_VARIAS.EXTRAS_MIN || x.length > LIMITES_VARIAS.EXTRAS_MAX) {
    return { ok: false, errores: [`Una placa con varias motos lleva de ${LIMITES_VARIAS.MOTOS_MIN} a ${LIMITES_VARIAS.MOTOS_MAX} motos.`] }
  }
  const motos: MotoExtra[] = []
  x.forEach((m, i) => {
    const p = `Moto ${i + 2}`
    if (!esObj(m)) return c.err(`${p}: tiene que ser un objeto.`)
    const ic = new Ctx('moto')
    for (const k of Object.keys(m)) if (!CLAVES.includes(k)) ic.err(`El campo "${k}" no está permitido.`)
    const fotoId = typeof m.fotoId === 'string' && UUID.test(m.fotoId) ? m.fotoId : null
    if (!fotoId) ic.err('Falta la foto.')
    const modelo = validarModelo(m.modelo)
    if (!modelo.ok) ic.errores.push(...modelo.errores)
    // Lugar e indicaciones son de la placa entera: acá solo importan el precio y la promo de ESTA moto.
    const datos = validarDatos({ precio: m.precio, promo: m.promo ?? { tipo: 'ninguna', detalle: '' } })
    if (!datos.ok) ic.errores.push(...datos.errores)
    if (ic.errores.length > 0 || !fotoId || !modelo.ok || !datos.ok) return c.errores.push(...ic.errores.map((e) => `${p}: ${e}`))
    motos.push({ fotoId, modelo: modelo.modelo, precio: datos.datos.precio, promo: datos.datos.promo })
  })
  if (c.errores.length > 0) return { ok: false, errores: c.errores }

  // Una foto repetida rompería el emparejamiento "moto k = foto k": se rechaza entre las extras y contra la principal.
  const ids = [...(o.fotoPrincipalId ? [o.fotoPrincipalId] : []), ...motos.map((m) => m.fotoId)]
  const repetida = ids.find((id, i) => ids.indexOf(id) !== i)
  if (repetida) return { ok: false, errores: ['Dos motos usan la misma foto: cada moto tiene que tener la suya.'] }
  return { ok: true, motos }
}
