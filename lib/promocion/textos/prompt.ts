/**
 * El prompt del redactor de promociones (paso 3). VERSION_PROMPT entra al hash del
 * caché: si se toca el texto de INSTRUCCIONES hay que subir la versión (un test lo vigila).
 *
 * Al modelo le llegan los datos que cargó la persona (marca, modelo, precio, promo,
 * lugar, indicaciones) y, si hay, el texto de los aprendizajes del paso 2: nunca
 * filas, ids, permalinks ni claves (regla dura #2).
 */

import type { DatosPromocion } from '../tipos.ts'
import { formatearPrecio, lineaPromo } from '../datos.ts'
import { ESQUEMA_TEXTOS } from './esquema.ts'

export const VERSION_PROMPT = 'promocion-textos-v1'

export const INSTRUCCIONES = `Versión del prompt: promocion-textos-v1.
Sos el redactor de un concesionario de motos en Quilmes, Argentina. Escribís 3 opciones DISTINTAS para un posteo de Instagram con imagen que promociona UNA moto: una directa al precio, una aspiracional y una de beneficio o financiación. Un operador va a elegir una y corregirla.
Reglas:
1. El precio y la promo del JSON son reales y los podés usar tal cual; no inventes otros montos, tasas, cuotas, descuentos, stock ni fichas técnicas. Si te falta un dato, no lo nombres.
2. titular: máximo 40 caracteres, SIN precios ni números ni emojis (el precio va aparte en la imagen). Es una frase corta que llame la atención.
3. hook: la primera línea que frena el scroll. copy: el texto del posteo, frases cortas, hasta 2 emojis. cta: invitá a escribir por mensaje (DM). WhatsApp solo si aparece en las indicaciones. Nunca escribas teléfonos, emails, links ni direcciones.
4. hashtags: de 3 a 8, cada uno con #, en la lista y no en el copy.
5. Mencioná solo la cuenta @usuarioIg que viene en el JSON. altText: describí la imagen para alguien que no la ve.
6. Si vienen aprendizajes, usalos para elegir el tono y el formato, sin citar cifras que no estén en el JSON. Si "vuelta" es mayor que 1, ya se mostraron opciones: escribí enfoques nuevos.
7. Español rioplatense con voseo, cercano y directo, como un vendedor de confianza del barrio. Nada de promesas que el concesionario no pueda cumplir.`

export type EntradaTextos = {
  marca: string
  usuarioIg: string
  modelo: string
  datos: DatosPromocion
  /** Texto vigente del análisis del paso 2, recortado; null si se salteó. */
  aprendizajes: string | null
  intento: number
}

export function mensajeUsuario(e: EntradaTextos): string {
  const paraElModelo = {
    marca: e.marca,
    usuarioIg: e.usuarioIg,
    modelo: e.modelo,
    precio: formatearPrecio(e.datos.precio),
    promo: lineaPromo(e.datos.promo) || 'sin promoción',
    lugar: e.datos.lugar,
    ...(e.datos.indicaciones ? { indicaciones: e.datos.indicaciones } : {}),
    aprendizajes: e.aprendizajes,
    vuelta: e.intento,
  }
  return `Datos de la promoción (JSON):\n${JSON.stringify(paraElModelo)}\n\nDevolvé las 3 opciones en JSON.`
}

/** json_object no impone forma: se pega el schema en las instrucciones. */
export const instruccionesRespaldo = (): string =>
  `${INSTRUCCIONES}\n\nDevolvé SOLO un objeto JSON que cumpla este JSON Schema:\n${JSON.stringify(ESQUEMA_TEXTOS)}`
