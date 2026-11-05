/** Las fotos de inspiración ya subidas (estilo, luz, ambiente), para reusarlas sin volver a subir. */

import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { firmar } from '../productor/pantalla.ts'
import { seleccionar, type Supabase } from '../supabase/rest.ts'

const MAX_INSPIRACIONES = 12

export type InspiracionElegible = { id: string; creadoEn: string; url: string | null }

export async function leerInspiraciones(s: Supabase, f: typeof fetch): Promise<InspiracionElegible[]> {
  const filas = await seleccionar<{ id: string; ruta: string | null; creado_en: string }>(
    s,
    'fotos',
    {
      select: 'id,ruta,creado_en',
      organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`,
      uso: 'eq.inspiracion',
      borrada_en: 'is.null',
      order: 'creado_en.desc',
      limit: String(MAX_INSPIRACIONES),
    },
    f,
  )
  const urls = await firmar(s, 'fotos', filas.flatMap((x) => (x.ruta ? [x.ruta] : [])), f)
  return filas.map((x) => ({ id: x.id, creadoEn: x.creado_en, url: x.ruta ? (urls.get(x.ruta) ?? null) : null }))
}
