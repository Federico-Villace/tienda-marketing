/**
 * PATCH /api/creativos/[id]: elegir (o quitar) la imagen de una pieza.
 *
 * No cuesta plata: solo exige sesión y rol, no Gemini. Como máximo una imagen
 * elegida por raíz de pieza lo garantiza la RPC (y un índice parcial).
 */

import { autorizarMiembro } from '../agentes/autorizar.ts'
import { error, responder, UUID } from '../agentes/http.ts'
import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { ErrorSupabase, rpc, seleccionar } from '../supabase/rest.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

export async function manejarElegir(request: Request, id: string, entorno: Entorno, f: Fetch): Promise<Response> {
  const ctx = await autorizarMiembro(request, entorno, 'elegir imágenes', f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase } = ctx

  if (!UUID.test(id)) return error('No se encontró el creativo.', 404)
  const cuerpo = (await request.json().catch(() => null)) as { elegida?: unknown } | null
  if (cuerpo === null || typeof cuerpo !== 'object' || typeof cuerpo.elegida !== 'boolean') {
    return error('Falta "elegida": true o false.', 400)
  }

  try {
    const [fila] = await seleccionar<{ id: string }>(
      supabase,
      'creativos',
      { select: 'id', id: `eq.${id}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
      f,
    )
    if (!fila) return error('No se encontró el creativo.', 404)

    const c = await rpc<{ id: string; orden: number; pieza_raiz_id: string; elegida: boolean }>(
      supabase,
      'elegir_creativo',
      { p_id: id, p_elegida: cuerpo.elegida, p_usuario: usuarioId },
      f,
    )
    return responder({ creativo: { id: c.id, orden: c.orden, piezaRaizId: c.pieza_raiz_id, elegida: c.elegida } }, 200)
  } catch (e) {
    if (e instanceof ErrorSupabase && e.status === 409) return error('Ese creativo no tiene imagen: no se puede elegir.', 409)
    if (e instanceof ErrorSupabase && e.status === 422) return error('Las imágenes de una foto no se eligen todavía.', 422)
    if (e instanceof ErrorSupabase && e.status === 404) return error('No se encontró el creativo.', 404)
    console.error('creativos: falló', e instanceof ErrorSupabase ? e.message : 'error interno')
    return error('No se pudo guardar la elección. Probá de nuevo en un momento.', 500)
  }
}
