/** Piezas comunes de las pantallas de los agentes. */

import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { seleccionar, type Supabase } from '../supabase/rest.ts'

export const puedeEditar = (rol: string | null): boolean => rol === 'director' || rol === 'operador'

/** El rol del usuario que verificó el proxy. Sin usuario o sin membresía: null. */
export async function leerRol(s: Supabase, usuarioId: string | null, f: typeof fetch): Promise<string | null> {
  if (!usuarioId) return null
  const [m] = await seleccionar<{ rol: string }>(
    s,
    'miembros',
    { select: 'rol', organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, usuario_id: `eq.${usuarioId}` },
    f,
  )
  return m?.rol ?? null
}
