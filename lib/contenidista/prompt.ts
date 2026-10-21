/**
 * El prompt del Contenidista. VERSION_PROMPT entra al hash del caché: si se toca
 * el texto de INSTRUCCIONES hay que subir la versión (un test lo vigila).
 *
 * Al modelo le llega el TEXTO de un plan aprobado (sin presupuesto), UNA semana
 * y las notas: nunca filas, agregados, ids, permalinks ni claves (regla dura #2).
 */

import { MARCAS } from '../datos/marcas.ts'
import type { Plan } from '../estratega/tipos.ts'
import { ESQUEMA_TANDA } from './esquema.ts'

export const VERSION_PROMPT = 'contenidista-v1'

export const INSTRUCCIONES = `Versión del prompt: contenidista-v1.
Sos el contenidista de 999 Motos, un grupo de concesionarios de motos en Quilmes, Argentina. Escribís las piezas de UNA semana de un plan ya aprobado por el director. Él las va a aprobar, corregir o descartar una por una.
Reglas:
1. Una pieza por unidad pedida: si una fila dice cantidad 3, son 3 piezas distintas con la misma plataforma, formato e idea en \`ideaOrigen\` (copiá la idea textual).
2. Precios, cuotas, tasas, descuentos, stock y promociones SOLO si están escritos en el plan o en las notas. Si no están, escribí [precio]. No inventes modelos, fichas técnicas ni beneficios.
3. CTA: invitá a escribir por mensaje (DM en Instagram, Messenger en Facebook). WhatsApp solo si aparece en el plan o las notas. Nunca escribas teléfonos, emails, links ni direcciones.
4. Instagram: hook que frene el scroll en la primera línea, frases cortas, hasta 2 emojis, 3 a 8 hashtags en \`hashtags\` (no en el copy). Facebook: más explicativo, sin hashtags o con 1 o 2. Historia: copy vacío y hashtags vacío (el texto va en el hook y en el brief visual).
5. guion solo en reel y video: escenas numeradas con lo que se ve y lo que se dice, hook en los 2 primeros segundos. En otros formatos, null.
6. altText solo en imagen y carrusel: describí la imagen para alguien que no la ve. En otros formatos, null.
7. briefVisual: qué foto o video hay que producir (encuadre, moto, lugar, texto en pantalla). No se genera nada todavía.
8. fecha dentro de la semana indicada; repartí los días. marca: una de las del plan. Mencioná con @ solo las cuentas de las marcas.
9. Español rioplatense con voseo, cercano y directo, como un vendedor de confianza del barrio. Nada de promesas que el concesionario no pueda cumplir.`

const semanaDe = (plan: Plan, semana: number) => plan.calendario.find((s) => s.semana === semana)

/** Sin presupuesto ni KPIs: el monto de pauta no es un precio y no hay que mandarlo. */
export function mensajeUsuario(plan: Plan, semana: number, desde: string, hasta: string, notas: string | null): string {
  const s = semanaDe(plan, semana)
  const paraElModelo = {
    objetivo: plan.objetivo,
    mensajeCentral: plan.mensajeCentral,
    publico: plan.publico.descripcion,
    marcas: plan.marcas,
    cuentas: plan.marcas.flatMap((nombre) => {
      const m = MARCAS.find((x) => x.nombre === nombre)
      return m ? [{ marca: m.nombre, usuarioIg: m.usuarioIg }] : []
    }),
  }
  return `Plan aprobado (JSON):\n${JSON.stringify(paraElModelo)}\n\nSemana ${semana} (${desde} a ${hasta}). Eje: ${s?.eje ?? ''}\nPiezas pedidas (JSON): ${JSON.stringify(s?.piezas ?? [])}\n\nNotas del director: ${notas ?? 'ninguna'}\n\nDevolvé las piezas en JSON.`
}

/**
 * Contra qué se respaldan los montos: solo el TEXTO que el modelo ve (plan y
 * notas). No entran fechas ni cantidades, que no son precios.
 */
export function textoFuente(plan: Plan, semana: number, notas: string | null): string {
  const s = semanaDe(plan, semana)
  return [plan.objetivo, plan.mensajeCentral, plan.publico.descripcion, s?.eje, ...(s?.piezas.map((p) => p.idea) ?? []), notas]
    .filter((t): t is string => typeof t === 'string')
    .join('\n')
}

/** json_object no impone forma: se pega el schema en las instrucciones. */
export const instruccionesRespaldo = (): string =>
  `${INSTRUCCIONES}\n\nDevolvé SOLO un objeto JSON que cumpla este JSON Schema:\n${JSON.stringify(ESQUEMA_TANDA)}`
