/**
 * validarOpciones / validarCopy: la ÚNICA puerta de un texto de promoción, venga
 * del redactor o de una edición humana (mismo patrón que validarPieza).
 *
 * · Del redactor (`validarOpciones`): exactamente 3 opciones. Un monto que no esté
 *   en el precio cargado, el detalle o las indicaciones se cambia por [precio]
 *   (ya se pagó la llamada: no se tira) y la persona lo completa. El PRECIO CARGADO
 *   sí está respaldado. WhatsApp solo si figura en esa fuente.
 * · De una persona (`validarCopy`): mismas formas y límites, pero ni se reemplazan
 *   montos ni se exige respaldo: el humano es la fuente de lo que escribe.
 *
 * El titular va grande en la placa y el precio va aparte: sin montos, números ni
 * emojis (satori no dibuja emojis sin bajarlos de un CDN).
 */

import { Ctx, EMAIL, TELEFONO, esObj, type Obj, type Validacion } from '../../agentes/validar.ts'
import { LIMITES, textoPublicado } from '../../contenidista/limites.ts'
import { MONTO, reemplazarMontos } from '../../contenidista/montos.ts'
import { HASHTAG, HASHTAG_EN_COPY, MENCION, WHATSAPP } from '../../contenidista/piezas.ts'
import type { Pieza } from '../../contenidista/tipos.ts'
import { TIENE_EMOJI } from '../datos.ts'
import type { CopyPromo } from '../tipos.ts'

export type ContextoTextos = {
  /** La única cuenta que se puede mencionar: la de la marca de la promoción. */
  usuarioIg: string
  /** Contra qué se respaldan montos y WhatsApp: precio cargado + detalle + indicaciones. */
  fuente: string
}

const CLAVES = ['titular', 'hook', 'copy', 'hashtags', 'cta', 'altText'] as const
const TITULAR_MAX = 40
const HASHTAGS_MIN = 3
const HASHTAGS_MAX = 8

function validarUna(c: Ctx, x: unknown, ruta: string, ctx: ContextoTextos, origen: 'agente' | 'edicion'): CopyPromo | null {
  const r = c.objeto(x, ruta, CLAVES)
  if (!r) return null
  const en = (k: string) => (ruta === c.raiz ? k : `${ruta}.${k}`)
  const antes = c.errores.length

  const titular = c.texto(r.titular, en('titular'), 1, TITULAR_MAX)
  if (TIENE_EMOJI.test(titular)) c.err(`"${en('titular')}" no puede llevar emojis.`)
  if (/\d/.test(titular)) c.err(`"${en('titular')}" no lleva precios ni números: el precio va aparte, en la imagen.`)
  const hook = c.texto(r.hook, en('hook'), 1, LIMITES.HOOK)
  const copy = c.texto(r.copy, en('copy'), 1, LIMITES.COPY)
  const cta = c.texto(r.cta, en('cta'), 1, LIMITES.CTA)
  const altText = c.texto(r.altText, en('altText'), 1, LIMITES.ALT)

  const hashtags = c.lista(r.hashtags, en('hashtags'), HASHTAGS_MIN, HASHTAGS_MAX).map((h, i) => {
    const t = typeof h === 'string' ? h.trim() : ''
    if (!HASHTAG.test(t)) c.err(`"${en('hashtags')}[${i}]" debe empezar con # y tener solo letras, números o guiones bajos.`)
    return t
  })
  const enCopy = copy.match(HASHTAG_EN_COPY)?.length ?? 0
  if (hashtags.length + enCopy > LIMITES.HASHTAGS) c.err(`Hay más de ${LIMITES.HASHTAGS} hashtags entre la lista y el copy.`)
  if (textoPublicado({ copy, hashtags }).length > LIMITES.COPY) c.err(`El copy con los hashtags pasa de ${LIMITES.COPY} caracteres.`)

  const menciones = [...copy.matchAll(MENCION)].map((m) => m[1]!.replace(/\.+$/, ''))
  if (menciones.length > LIMITES.MENCIONES) c.err(`Hay más de ${LIMITES.MENCIONES} menciones (@) en el copy.`)
  for (const m of new Set(menciones)) {
    if (m !== ctx.usuarioIg) c.err(`La mención @${m} no es la cuenta de la marca (@${ctx.usuarioIg}).`)
  }

  // Sin email ni teléfono. Los montos se sacan antes de buscar teléfonos: "$ 12.500.000" no es un contacto.
  const textos = [titular, hook, copy, cta, altText, ...hashtags]
  if (textos.some((t) => EMAIL.test(t) || TELEFONO.test(t.replace(MONTO, ' ')))) {
    c.err('Los textos no pueden llevar emails ni teléfonos: la gente escribe por mensaje.')
  }
  if (origen === 'agente' && textos.some((t) => WHATSAPP.test(t)) && !WHATSAPP.test(ctx.fuente)) {
    c.err('Se menciona WhatsApp y no figura en las indicaciones.')
  }

  return c.errores.length === antes ? { titular, hook, copy, hashtags, cta, altText } : null
}

/** Un monto que el modelo inventó se cambia por [precio]; lo que no tenga forma de texto se deja: la validación lo rechaza. */
function limpiarMontos(crudo: unknown, fuente: string): unknown {
  if (!esObj(crudo) || !Array.isArray(crudo.opciones)) return crudo
  const opciones = crudo.opciones.map((o: unknown) => {
    const t = o as Obj | null
    const forma =
      esObj(t) &&
      ['hook', 'copy', 'cta', 'altText'].every((k) => typeof t[k] === 'string') &&
      Array.isArray(t.hashtags) &&
      t.hashtags.every((h) => typeof h === 'string')
    if (!forma) return o
    // reemplazarMontos trabaja sobre una Pieza: se le pasan solo los campos de texto que comparten.
    const p = reemplazarMontos(
      { hook: t.hook, copy: t.copy, cta: t.cta, altText: t.altText, hashtags: t.hashtags, guion: null, briefVisual: '' } as unknown as Pieza,
      fuente,
    )
    return { ...t, hook: p.hook, copy: p.copy, cta: p.cta, altText: p.altText, hashtags: p.hashtags }
  })
  return { ...crudo, opciones }
}

/** Las 3 opciones del redactor: `{ opciones: [...] }`. */
export function validarOpciones(x: unknown, ctx: ContextoTextos): Validacion<CopyPromo[], 'opciones'> {
  const c = new Ctx('textos')
  const r = c.objeto(limpiarMontos(x, ctx.fuente), 'textos', ['opciones'])
  if (!r) return { ok: false, errores: c.errores }
  const lista = Array.isArray(r.opciones) ? r.opciones : null
  if (!lista || lista.length !== 3) {
    c.err('Tienen que ser exactamente 3 opciones.')
    return { ok: false, errores: c.errores }
  }
  const opciones = lista.map((o, i) => validarUna(c, o, `opciones[${i}]`, ctx, 'agente'))
  if (c.errores.length > 0) return { ok: false, errores: c.errores }
  return { ok: true, opciones: opciones as CopyPromo[] }
}

/** El texto elegido y editado por una persona. */
export function validarCopy(x: unknown, ctx: ContextoTextos): Validacion<CopyPromo, 'copy'> {
  const c = new Ctx('copy')
  const copy = validarUna(c, x, 'copy', ctx, 'edicion')
  if (!copy || c.errores.length > 0) return { ok: false, errores: c.errores }
  return { ok: true, copy }
}
