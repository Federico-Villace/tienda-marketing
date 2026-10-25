/**
 * El schema del plan para structured outputs de OpenAI, y los dos formatos.
 *
 * Reglas de strict: todo objeto con additionalProperties:false y TODOS sus campos
 * en required; los nulos van como unión con 'null'. Sin minimum/pattern/etc.:
 * no está confirmado qué keywords acepta strict, los rangos los controla
 * validarPlan. Si OpenAI rechaza el schema, el endpoint cae a FORMATO_RESPALDO.
 */

import type { FormatoTexto } from '../agentes/openai.ts'
import { FORMATOS, NIVELES_PRESUPUESTO, PLATAFORMAS } from './tipos.ts'

const texto = { type: 'string' } as const
const entero = { type: 'integer' } as const

const objeto = <P extends Record<string, unknown>>(properties: P) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})

const lista = <T>(items: T) => ({ type: 'array', items })

export const ESQUEMA_PLAN = objeto({
  objetivo: texto,
  mensajeCentral: texto,
  publico: objeto({
    descripcion: texto,
    segmentos: lista(objeto({ nombre: texto, criterio: texto, porque: texto })),
  }),
  marcas: lista(texto),
  presupuesto: objeto({
    montoArs: { type: ['number', 'null'] },
    nivel: { type: 'string', enum: [...NIVELES_PRESUPUESTO] },
    nota: { type: ['string', 'null'] },
  }),
  ventana: objeto({ desde: texto, hasta: texto }),
  canales: lista(
    objeto({
      plataforma: { type: 'string', enum: [...PLATAFORMAS] },
      formatos: lista({ type: 'string', enum: [...FORMATOS] }),
      porcentaje: entero,
      porque: texto,
    }),
  ),
  calendario: lista(
    objeto({
      semana: entero,
      eje: texto,
      piezas: lista(
        objeto({
          plataforma: { type: 'string', enum: [...PLATAFORMAS] },
          formato: { type: 'string', enum: [...FORMATOS] },
          cantidad: entero,
          idea: texto,
          marca: { type: ['string', 'null'] },
        }),
      ),
    }),
  ),
  kpis: lista(objeto({ metrica: texto, meta: texto })),
  fundamentos: lista(texto),
  supuestos: lista(texto),
})

/** Aislado a propósito: si strict falla con el modelo, se cambia o se saca acá. */
export const FORMATO_ESTRATEGA: FormatoTexto = {
  type: 'json_schema',
  name: 'plan_campania',
  strict: true,
  schema: ESQUEMA_PLAN,
}

/** Plan B: JSON libre (con el schema pegado en las instrucciones) + validarPlan. */
export const FORMATO_RESPALDO: FormatoTexto = { type: 'json_object' }
