/**
 * El schema de los textos de una promoción para structured outputs de OpenAI (strict).
 *
 * Mismas reglas que el del Contenidista: todo objeto con additionalProperties:false
 * y TODOS sus campos en required; sin minItems/maxItems/pattern (strict no los
 * admite: que sean exactamente 3 y los largos los controla validarOpciones). Si
 * OpenAI rechaza el schema, el endpoint cae a json_object con el schema pegado.
 */

import type { FormatoTexto } from '../../agentes/openai.ts'

const texto = { type: 'string' } as const

const objeto = <P extends Record<string, unknown>>(properties: P) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})

export const ESQUEMA_TEXTOS = objeto({
  opciones: {
    type: 'array',
    items: objeto({
      titular: texto,
      hook: texto,
      copy: texto,
      hashtags: { type: 'array', items: texto },
      cta: texto,
      altText: texto,
    }),
  },
})

export const FORMATO_TEXTOS: FormatoTexto = {
  type: 'json_schema',
  name: 'textos_promocion',
  strict: true,
  schema: ESQUEMA_TEXTOS,
}
