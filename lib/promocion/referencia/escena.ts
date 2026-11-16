/**
 * La escena (la imagen de la moto) de la plantilla 'referencia' se funde con los colores del diseño leído: la moto va en su
 * propia caja, con los bordes difuminados, sobre el fondo de la referencia. Para que el fundido no se note, el prompt le pide a
 * Gemini un fondo con esos mismos colores. Acá se sacan esos colores de la lectura (ya validada: solo '#RRGGBB').
 */

import { ORGANIZACION_PILOTO_ID } from '../../organizacion.ts'
import { seleccionar, type Supabase } from '../../supabase/rest.ts'
import type { PlantillaReferencia } from './tipos.ts'

const HEX = /^#[0-9A-F]{6}$/

/** Los colores del fondo del diseño (1 o 2, sin repetir). Nada que no sea '#RRGGBB' llega al prompt. */
export function coloresDeEscena(p: Pick<PlantillaReferencia, 'fondo'>): string[] {
  const colores = [p.fondo.color, p.fondo.tipo === 'degradado' ? p.fondo.color2 : null]
  return colores.filter((c, i): c is string => typeof c === 'string' && HEX.test(c) && colores.indexOf(c) === i)
}

/** Los colores de una lectura LISTA de la organización; null si no hay (la escena no se estima sin la lectura). */
export async function leerColoresDeReferencia(s: Supabase, lecturaId: string | null, f: typeof fetch): Promise<string[] | null> {
  if (lecturaId === null) return null
  const [fila] = await seleccionar<{ plantilla: PlantillaReferencia | null }>(
    s,
    'referencias_diseno',
    { select: 'plantilla', id: `eq.${lecturaId}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, estado: 'eq.lista', limit: '1' },
    f,
  )
  return fila?.plantilla ? coloresDeEscena(fila.plantilla) : null
}
