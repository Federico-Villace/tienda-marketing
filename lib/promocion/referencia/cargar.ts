/** Lectura de una referencia desde la base, para dibujar la placa y para las pantallas (solo servidor). */

import { ORGANIZACION_PILOTO_ID } from '../../organizacion.ts'
import { seleccionar, type Supabase } from '../../supabase/rest.ts'
import { COLUMNAS_LECTURA, vistaDeLectura, type FilaLectura, type LecturaVista } from './lectura.ts'
import type { PlantillaReferencia } from './tipos.ts'

/** La lectura usable (lista o inutilizable) de la organización; null si no hay id, no existe o no terminó bien. */
export async function leerVistaDeLectura(s: Supabase, id: string | null, f: typeof fetch): Promise<LecturaVista | null> {
  if (id === null) return null
  const [fila] = await seleccionar<FilaLectura>(s, 'referencias_diseno', { select: COLUMNAS_LECTURA, id: `eq.${id}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' }, f)
  return vistaDeLectura(fila)
}

/** La plantilla leída, solo de una lectura LISTA: es lo único que dibuja la plantilla 'referencia'. */
export async function leerPlantillaLista(s: Supabase, id: string | null, f: typeof fetch): Promise<PlantillaReferencia | null> {
  const v = await leerVistaDeLectura(s, id, f)
  return v?.estado === 'lista' ? v.plantilla : null
}

/** Varias lecturas usables de una vez (las hijas de una tanda): un mapa id → lectura. */
export async function leerVistasDeLecturas(s: Supabase, ids: readonly string[], f: typeof fetch): Promise<Map<string, LecturaVista>> {
  const unicos = [...new Set(ids)]
  const resultado = new Map<string, LecturaVista>()
  if (unicos.length === 0) return resultado
  const filas = await seleccionar<FilaLectura>(s, 'referencias_diseno', { select: COLUMNAS_LECTURA, id: `in.(${unicos.join(',')})`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}` }, f)
  for (const fila of filas) {
    const v = vistaDeLectura(fila)
    if (v) resultado.set(v.id, v)
  }
  return resultado
}
