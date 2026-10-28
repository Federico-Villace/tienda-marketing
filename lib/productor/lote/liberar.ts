/**
 * POST /api/generaciones/lote/[id]/liberar: lo confirmado que nunca se generó (se cerró la
 * pestaña a mitad del lote) deja de contar en el tope del mes (ADR-032). Cada imagen queda
 * en 'error' con costo real 0 ("Liberada sin generar"). No gasta nada ni llama a Gemini,
 * así que no exige el Productor encendido: solo sesión y rol.
 */

import { autorizarMiembro } from '../../agentes/autorizar.ts'
import { error, responder, UUID } from '../../agentes/http.ts'
import { ORGANIZACION_PILOTO_ID } from '../../organizacion.ts'
import { ErrorSupabase, rpc, seleccionar } from '../../supabase/rest.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

export async function manejarLiberacionLote(request: Request, id: string, entorno: Entorno, f: Fetch): Promise<Response> {
  const ctx = await autorizarMiembro(request, entorno, 'liberar imágenes', f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase } = ctx

  if (!UUID.test(id)) return error('No se encontró el lote.', 404)

  try {
    const [lote] = await seleccionar<{ id: string }>(supabase, 'lotes_generacion', { select: 'id', id: `eq.${id}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' }, f)
    if (!lote) return error('No se encontró el lote.', 404)
    const liberadas = await rpc<number>(supabase, 'liberar_generaciones_lote', { p_lote: id, p_usuario: usuarioId }, f)
    return responder({ liberadas: Number(liberadas) || 0 }, 200)
  } catch (err) {
    if (err instanceof ErrorSupabase && err.status === 404) return error('No se encontró el lote.', 404)
    console.error('lote: falló la liberación', err instanceof ErrorSupabase ? err.message : 'error interno')
    return error('No se pudo liberar el lote. Probá de nuevo en un momento.', 500)
  }
}
