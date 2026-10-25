/** De un error de la base (PTnnn → HTTP) a la respuesta de los endpoints de promociones. */

import { error } from '../agentes/http.ts'
import { ErrorSupabase } from '../supabase/rest.ts'

export const MENSAJE_REVISION = 'Esta promoción cambió: recargá la pantalla.'

export function respuestaDeError(e: unknown, contexto: string): Response {
  if (e instanceof ErrorSupabase) {
    if (e.status === 404) return error('No se encontró la promoción.', 404)
    if (e.status === 409) return error(MENSAJE_REVISION, 409)
    if (e.status === 422) return error('Falta completar la promoción: elegí el texto y la imagen.', 422)
  }
  // Solo el mensaje de errores propios; nunca el objeto entero.
  console.error(`promociones: falló ${contexto}`, e instanceof ErrorSupabase ? e.message : 'error interno')
  return error('No se pudo actualizar la promoción. Probá de nuevo en un momento.', 500)
}
