/**
 * El schema del análisis v4 para structured outputs de OpenAI, y los dos formatos.
 *
 * Mismas reglas de strict que lib/estratega/esquema.ts: todo objeto con
 * additionalProperties:false y TODOS sus campos en required; los nulos van como
 * unión con 'null'; sin minLength/maxLength/etc. (no está confirmado qué keywords
 * acepta strict): los largos y rangos los controla validarAnalisisV4. Si OpenAI
 * rechaza el schema, pedirJson cae a FORMATO_RESPALDO.
 */

import type { FormatoTexto } from '../agentes/openai.ts'
import { TIPOS_PROMO } from '../promocion/tipos.ts'

const texto = { type: 'string' } as const

const objeto = <P extends Record<string, unknown>>(properties: P) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})

const lista = <T>(items: T) => ({ type: 'array', items })

export const FORMATOS_IDEA = ['reel', 'carrusel', 'imagen', 'historia'] as const

const item = objeto({ accion: texto, porque: texto, hechos: lista(texto) })

export const ESQUEMA_ANALISIS_V4 = objeto({
  resumen: texto,
  hace: lista(item),
  evita: lista(item),
  proba: lista(item),
  ideas: lista(
    objeto({
      titulo: texto,
      marca: { type: ['string', 'null'] },
      modelo: { type: ['string', 'null'] },
      formato: { type: 'string', enum: [...FORMATOS_IDEA] },
      tipoPromo: { type: 'string', enum: [...TIPOS_PROMO] },
      momento: texto,
      porque: texto,
      hechos: lista(texto),
    }),
  ),
})

/** Aislado a propósito: si strict falla con el modelo, se cambia o se saca acá. */
export const FORMATO_ANALISTA: FormatoTexto = {
  type: 'json_schema',
  name: 'analisis_v4',
  strict: true,
  schema: ESQUEMA_ANALISIS_V4,
}

/** Plan B: JSON libre (con el schema pegado en las instrucciones) + validarAnalisisV4. */
export const FORMATO_RESPALDO: FormatoTexto = { type: 'json_object' }
