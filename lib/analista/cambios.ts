/**
 * PATCH /api/analisis/[id]: editar un análisis anterior del Analista.
 *
 * Editar es humano: no llama a OpenAI ni a Meta y no cuesta. Cada edición es una
 * versión nueva (editar_analisis, transaccional) y el original que escribió el
 * modelo queda intacto. Si la versión que la persona veía ya no es la última, la
 * base responde PT409 y acá sale un 409. Mismo patrón que lib/contenidista/cambios.ts.
 */

import { autorizarMiembro } from '../agentes/autorizar.ts'
import { error, responder, UUID } from '../agentes/http.ts'
import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { ErrorSupabase, rpc, seleccionar } from '../supabase/rest.ts'
import { MAX_ANALISIS } from './limites.ts'
import { COLUMNAS_ANALISIS, leerEdiciones, vistaDeFila, type FilaAnalisis } from './historial.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

export async function manejarEdicionAnalisis(request: Request, id: string, entorno: Entorno, f: Fetch): Promise<Response> {
  const ctx = await autorizarMiembro(request, entorno, 'editar análisis', f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase } = ctx

  if (!UUID.test(id)) return error('El id del análisis no es válido.', 400)

  const cuerpo = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const version = cuerpo?.version
  if (cuerpo === null || typeof cuerpo !== 'object' || typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return error('Falta la versión del análisis que estás viendo.', 400)
  }
  const contenido = typeof cuerpo.contenido === 'string' ? cuerpo.contenido.trim() : ''
  if (contenido === '' || contenido.length > MAX_ANALISIS) {
    return error(`El análisis tiene que tener entre 1 y ${MAX_ANALISIS} caracteres.`, 400)
  }

  try {
    const [fila] = await seleccionar<FilaAnalisis>(
      supabase,
      'analisis',
      { select: COLUMNAS_ANALISIS, id: `eq.${id}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
      f,
    )
    if (!fila) return error('No se encontró el análisis.', 404)

    await rpc(supabase, 'editar_analisis', { p_id: id, p_version: version, p_contenido: contenido, p_usuario: usuarioId }, f)
    return responder({ analisis: vistaDeFila(fila, false, await leerEdiciones(supabase, [id], f)) }, 200)
  } catch (e) {
    if (e instanceof ErrorSupabase && e.status === 409) return error('Este análisis cambió: recargá la pantalla.', 409)
    if (e instanceof ErrorSupabase && e.status === 404) return error('No se encontró el análisis.', 404)
    // Solo el mensaje de errores propios; nunca el objeto entero.
    console.error('analisis: falló la edición', e instanceof ErrorSupabase ? e.message : 'error interno')
    return error('No se pudo guardar la edición. Probá de nuevo en un momento.', 500)
  }
}
