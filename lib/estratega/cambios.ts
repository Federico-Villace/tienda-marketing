/**
 * PATCH /api/planes/[id]: aprobar, descartar o editar un plan.
 *
 * Ninguna acción llama a OpenAI ni a Meta: cambiar un estado no cuesta. Las
 * transiciones viven en RPCs de Postgres (transaccionales); si la versión que la
 * persona veía ya no es la vigente, la base responde PT409 y acá sale un 409.
 * Un plan editado pasa por validarPlan, el mismo validador que el del LLM.
 */

import { autorizarMiembro } from '../agentes/autorizar.ts'
import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { ErrorSupabase, rpc, seleccionar } from '../supabase/rest.ts'
import { COLUMNAS_PLAN, vistaDeFila, type FilaPlan } from './historial.ts'
import { validarPlan } from './plan.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const responder = (cuerpo: unknown, status: number) => Response.json(cuerpo, { status })
const error = (mensaje: string, status: number) => responder({ error: mensaje }, status)

export async function manejarCambioPlan(
  request: Request,
  id: string,
  entorno: Entorno,
  f: Fetch,
): Promise<Response> {
  const ctx = await autorizarMiembro(request, entorno, 'cambiar planes', f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase } = ctx

  if (!UUID.test(id)) return error('No se encontró el plan.', 404)

  const cuerpo = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const version = cuerpo?.version
  if (cuerpo === null || typeof cuerpo !== 'object' || typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return error('Falta la versión del plan que estás viendo.', 400)
  }
  const accion = cuerpo.accion
  const edita = cuerpo.plan !== undefined
  if (!edita && accion !== 'aprobar' && accion !== 'descartar') {
    return error('Acción desconocida: usá "aprobar", "descartar" o mandá un plan.', 400)
  }

  try {
    const [fila] = await seleccionar<FilaPlan>(
      supabase,
      'planes',
      { select: COLUMNAS_PLAN, id: `eq.${id}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
      f,
    )
    if (!fila) return error('No se encontró el plan.', 404)

    let resultado: FilaPlan
    if (edita) {
      const plan = validarPlan(cuerpo.plan, fila.brief)
      if (!plan.ok) return responder({ error: 'El plan no es válido.', errores: plan.errores }, 422)
      resultado = await rpc<FilaPlan>(supabase, 'editar_plan', { p_id: id, p_version: version, p_plan: plan.plan, p_usuario: usuarioId }, f)
    } else if (accion === 'aprobar') {
      resultado = await rpc<FilaPlan>(supabase, 'aprobar_plan', { p_id: id, p_version: version, p_usuario: usuarioId }, f)
    } else {
      resultado = await rpc<FilaPlan>(supabase, 'descartar_plan', { p_id: id, p_version: version }, f)
    }
    return responder({ plan: vistaDeFila(resultado) }, 200)
  } catch (e) {
    if (e instanceof ErrorSupabase && e.status === 409) return error('Este plan cambió: recargá la pantalla.', 409)
    if (e instanceof ErrorSupabase && e.status === 404) return error('No se encontró el plan.', 404)
    // Solo el mensaje de errores propios; nunca el objeto entero.
    console.error('planes: falló el cambio', e instanceof ErrorSupabase ? e.message : 'error interno')
    return error('No se pudo actualizar el plan. Probá de nuevo en un momento.', 500)
  }
}
