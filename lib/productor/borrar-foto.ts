/**
 * DELETE /api/fotos/[id]: borra el original del cliente.
 *
 * Es un borrado suave: se marca la fila, se elimina el objeto de Storage y
 * recién entonces `ruta` queda en null. La fila se conserva porque las
 * generaciones y los creativos derivados la referencian (auditoría de derechos
 * y de costo). Idempotente: borrar dos veces da 200. No cuesta plata.
 */

import { autorizarMiembro } from '../agentes/autorizar.ts'
import { error, responder, UUID } from '../agentes/http.ts'
import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { actualizar, ErrorSupabase, seleccionar } from '../supabase/rest.ts'
import { borrarObjetos } from '../supabase/storage.ts'
import { BUCKET_FOTOS } from './subir-foto.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

const msj = (e: unknown) => (e instanceof ErrorSupabase ? e.message : 'error interno')

export async function manejarBorradoFoto(
  request: Request,
  id: string,
  entorno: Entorno,
  f: Fetch,
  ahora: () => number = Date.now,
): Promise<Response> {
  const ctx = await autorizarMiembro(request, entorno, 'borrar fotos', f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase } = ctx

  if (!UUID.test(id)) return error('No se encontró la foto.', 404)

  try {
    const [foto] = await seleccionar<{ id: string; ruta: string | null; borrada_en: string | null }>(
      supabase,
      'fotos',
      { select: 'id,ruta,borrada_en', id: `eq.${id}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
      f,
    )
    if (!foto) return error('No se encontró la foto.', 404)
    // Ya borrada del todo: nada que hacer.
    if (foto.ruta === null) return responder({ ok: true, pendiente: false }, 200)

    // 1) Marcar: desde acá la foto ya no se puede usar, aunque el objeto siga.
    if (foto.borrada_en === null) {
      await actualizar(supabase, 'fotos', { id }, { borrada_en: new Date(ahora()).toISOString(), borrada_por: usuarioId }, f)
    }

    // 2) Borrar el objeto. Si falla, la ruta queda para reintentar.
    try {
      await borrarObjetos(supabase, BUCKET_FOTOS, [foto.ruta], f)
    } catch (e) {
      console.error('fotos: no se pudo borrar el objeto', msj(e))
      return responder({ ok: true, pendiente: true }, 200)
    }

    // 3) Recién ahora se suelta la ruta.
    await actualizar(supabase, 'fotos', { id }, { ruta: null }, f)
    return responder({ ok: true, pendiente: false }, 200)
  } catch (e) {
    console.error('fotos: falló el borrado', msj(e))
    return error('No se pudo borrar la foto. Probá de nuevo en un momento.', 500)
  }
}
