/**
 * El prompt del Estratega. VERSION_PROMPT entra al hash del caché: si se toca el
 * texto de INSTRUCCIONES hay que subir la versión (un test lo vigila).
 *
 * Al modelo le llega el TEXTO de un análisis guardado y el brief: nunca filas ni
 * agregados (regla dura #2) ni ids.
 */

import { ESQUEMA_PLAN } from './esquema.ts'
import type { Brief } from './tipos.ts'

export const VERSION_PROMPT = 'estratega-v1'

export const INSTRUCCIONES = `Sos el estratega de marketing de 999 Motos, un grupo de concesionarios de motos en Quilmes, Argentina. Le escribís al director comercial: quiere un plan concreto que pueda aprobar o corregir en 5 minutos. Recibís el análisis del período (texto) y un brief.
Reglas:
1. Cada cifra que pongas tiene que estar en el análisis o en el brief. No inventes resultados, alcances ni ventas esperadas. Si una meta no tiene base, escribila sin número (por ejemplo, 'subir consultas por mensaje').
2. En \`fundamentos\` citá textual (entre comillas) las frases del análisis que justifican el plan. Si las notas del brief corrigen el análisis, mandan las notas.
3. El público es una DESCRIPCIÓN: edad, zona, intereses, momento de compra. Nada de listas, datos personales ni audiencias personalizadas.
4. El presupuesto es una propuesta en ARS que no supera el tope del brief. Si no hay tope o no alcanza para decidir, poné montoArs null y nivel 'a_definir'.
5. Solo Instagram y Facebook. El calendario cubre la ventana del brief, una semana por fila.
6. Español rioplatense, frases cortas y concretas (formato, día, idea de pieza).`

/** Sin el id del análisis: al modelo no le sirve y no hay que mandarle ids. */
export function mensajeUsuario(contenido: string, brief: Brief): string {
  const { analisisId: _omitido, ...paraElModelo } = brief
  return `Análisis (texto del Analista):\n<<<${contenido}>>>\n\nBrief (JSON):\n${JSON.stringify(paraElModelo)}\n\nDevolvé el plan en JSON.`
}

/** json_object no impone forma: se pega el schema en las instrucciones. */
export const instruccionesRespaldo = (): string =>
  `${INSTRUCCIONES}\n\nDevolvé SOLO un objeto JSON que cumpla este JSON Schema:\n${JSON.stringify(ESQUEMA_PLAN)}`
