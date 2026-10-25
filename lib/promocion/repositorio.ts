/** Lectura y edición de una promoción con la clave secreta (solo servidor). */

import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { ErrorSupabase, rpc, seleccionar, type Supabase } from '../supabase/rest.ts'
import { COLUMNAS_PROMOCION, type FilaPromocion } from './tipos.ts'

type Fetch = typeof fetch

export async function leerPromocion(s: Supabase, id: string, f: Fetch): Promise<FilaPromocion | undefined> {
  const [fila] = await seleccionar<FilaPromocion>(
    s,
    'promociones',
    { select: COLUMNAS_PROMOCION, id: `eq.${id}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
    f,
  )
  return fila
}

/**
 * editar_promocion con la revisión que se leyó. Si otro cambio se coló en el medio
 * (409) se relee y se reintenta UNA vez, siempre que siga siendo un borrador: sirve
 * para guardar el resultado de un agente (ya pagado) sin pedirle a la persona que recargue.
 */
export async function editarPromocion(
  s: Supabase,
  promo: FilaPromocion,
  campos: Record<string, unknown>,
  usuarioId: string,
  f: Fetch,
): Promise<FilaPromocion> {
  const intentar = (p: FilaPromocion) =>
    rpc<FilaPromocion>(s, 'editar_promocion', { p_id: p.id, p_revision: p.revision, p_campos: campos, p_usuario: usuarioId }, f)
  try {
    return await intentar(promo)
  } catch (e) {
    if (!(e instanceof ErrorSupabase && e.status === 409)) throw e
    const actual = await leerPromocion(s, promo.id, f)
    if (!actual || actual.estado !== 'borrador') throw e
    return intentar(actual)
  }
}
