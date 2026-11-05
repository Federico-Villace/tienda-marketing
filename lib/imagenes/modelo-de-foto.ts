/**
 * El "nombre" de una foto de moto: no se guarda, se deriva del modelo de la promoción MÁS NUEVA que la usó.
 * Una foto que nunca se usó no tiene nombre (la pantalla dice "Foto sin moto asignada").
 */

import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { seleccionar, type Supabase } from '../supabase/rest.ts'

type Fila = { foto_id: string; modelo: string; creado_en: string }

/** De las filas (en cualquier orden), el modelo de la promoción más nueva de cada foto. */
export function primerModeloPorFoto(filas: readonly Fila[]): Map<string, string> {
  const masNueva = new Map<string, Fila>()
  for (const x of filas) {
    const actual = masNueva.get(x.foto_id)
    if (!actual || x.creado_en > actual.creado_en) masNueva.set(x.foto_id, x)
  }
  return new Map([...masNueva].map(([id, x]) => [id, x.modelo]))
}

export async function modeloPorFoto(s: Supabase, fotoIds: readonly string[], f: typeof fetch): Promise<Map<string, string>> {
  if (fotoIds.length === 0) return new Map()
  const filas = await seleccionar<Fila>(
    s,
    'promociones',
    { select: 'foto_id,modelo,creado_en', organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, foto_id: `in.(${fotoIds.join(',')})`, order: 'creado_en.desc' },
    f,
  )
  return primerModeloPorFoto(filas)
}
