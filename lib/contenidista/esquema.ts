/**
 * El schema de la tanda para structured outputs de OpenAI (strict).
 *
 * Mismas reglas que el del Estratega: todo objeto con additionalProperties:false
 * y TODOS sus campos en required; los nulos como unión con 'null'; sin
 * minimum/pattern/etc. (los límites los controla validarPiezas). Si OpenAI
 * rechaza el schema, el endpoint cae a json_object con el schema pegado.
 */

import type { FormatoTexto } from '../agentes/openai.ts'
import { MARCAS } from '../datos/marcas.ts'
import { FORMATOS, PLATAFORMAS } from './tipos.ts'

const texto = { type: 'string' } as const

const objeto = <P extends Record<string, unknown>>(properties: P) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})

const lista = <T>(items: T) => ({ type: 'array', items })

export const ESQUEMA_TANDA = objeto({
  piezas: lista(
    objeto({
      marca: { type: 'string', enum: MARCAS.map((m) => m.nombre) },
      plataforma: { type: 'string', enum: [...PLATAFORMAS] },
      formato: { type: 'string', enum: [...FORMATOS] },
      fecha: texto,
      hook: texto,
      copy: texto,
      hashtags: lista(texto),
      cta: texto,
      guion: { type: ['string', 'null'] },
      briefVisual: texto,
      altText: { type: ['string', 'null'] },
      ideaOrigen: texto,
    }),
  ),
})

export const FORMATO_CONTENIDISTA: FormatoTexto = {
  type: 'json_schema',
  name: 'tanda_contenido',
  strict: true,
  schema: ESQUEMA_TANDA,
}

/** El cambio pedido a una pieza devuelve los 7 campos de texto; el resto (marca, plataforma, formato, fecha, idea) sale de la pieza. */
export const ESQUEMA_PIEZA_CAMBIO = objeto({
  hook: texto,
  copy: texto,
  hashtags: lista(texto),
  cta: texto,
  guion: { type: ['string', 'null'] },
  briefVisual: texto,
  altText: { type: ['string', 'null'] },
})

export const FORMATO_PIEZA_CAMBIO: FormatoTexto = {
  type: 'json_schema',
  name: 'pieza_cambio',
  strict: true,
  schema: ESQUEMA_PIEZA_CAMBIO,
}
