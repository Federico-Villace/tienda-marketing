/**
 * PATCH /api/piezas/[id]: aprobar, descartar o editar una pieza.
 *
 * Ninguna acción llama a OpenAI ni a Meta: cambiar una pieza no cuesta. Las
 * transiciones viven en RPCs de Postgres (transaccionales); si la versión que la
 * persona veía ya no es la vigente, la base responde PT409 y acá sale un 409.
 * Una pieza editada pasa por validarPieza, el mismo validador que el del LLM
 * (sin la exigencia de respaldar montos: el humano es la fuente de lo que escribe).
 */

import { autorizarMiembro } from '../agentes/autorizar.ts'
import { error, responder, UUID } from '../agentes/http.ts'
import type { Plan } from '../estratega/tipos.ts'
import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { ErrorSupabase, rpc, seleccionar } from '../supabase/rest.ts'
import { COLUMNAS_PIEZA, vistaDePieza, type FilaPieza } from './historial.ts'
import { validarPieza } from './piezas.ts'
import { rangoSemana } from './semana.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

export async function manejarCambioPieza(request: Request, id: string, entorno: Entorno, f: Fetch): Promise<Response> {
  const ctx = await autorizarMiembro(request, entorno, 'cambiar piezas', f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase } = ctx

  if (!UUID.test(id)) return error('El id de la pieza no es válido.', 400)

  const cuerpo = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const version = cuerpo?.version
  if (cuerpo === null || typeof cuerpo !== 'object' || typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return error('Falta la versión de la pieza que estás viendo.', 400)
  }
  const accion = cuerpo.accion
  const edita = cuerpo.pieza !== undefined
  if (!edita && accion !== 'aprobar' && accion !== 'descartar') {
    return error('Acción desconocida: usá "aprobar", "descartar" o mandá una pieza.', 400)
  }

  try {
    const [fila] = await seleccionar<FilaPieza>(
      supabase,
      'piezas',
      { select: COLUMNAS_PIEZA, id: `eq.${id}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
      f,
    )
    if (!fila) return error('No se encontró la pieza.', 404)

    let resultado: FilaPieza
    if (edita) {
      // Si ya no es la versión que veía, ni se valida: hay que recargar.
      if (fila.version !== version) return error('Esta pieza cambió: recargá la pantalla.', 409)
      const [plan] = await seleccionar<{ plan: Plan }>(
        supabase,
        'planes',
        { select: 'plan', id: `eq.${fila.plan_id}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
        f,
      )
      const rango = plan ? rangoSemana(plan.plan, fila.semana) : null
      if (!plan || !rango) return error('No se pudo leer la semana del plan de esta pieza.', 422)

      const contexto = { plan: plan.plan, semana: fila.semana, desde: rango.desde, hasta: rango.hasta, fuente: '' }
      const validada = validarPieza(cuerpo.pieza, contexto, { origen: 'edicion', base: fila.pieza })
      if (!validada.ok) return responder({ error: 'La pieza no es válida.', errores: validada.errores }, 422)
      resultado = await rpc<FilaPieza>(supabase, 'editar_pieza', { p_id: id, p_version: version, p_pieza: validada.pieza, p_usuario: usuarioId }, f)
    } else if (accion === 'aprobar') {
      resultado = await rpc<FilaPieza>(supabase, 'aprobar_pieza', { p_id: id, p_version: version, p_usuario: usuarioId }, f)
    } else {
      resultado = await rpc<FilaPieza>(supabase, 'descartar_pieza', { p_id: id, p_version: version }, f)
    }
    return responder({ pieza: vistaDePieza(resultado) }, 200)
  } catch (e) {
    if (e instanceof ErrorSupabase && e.status === 409) return error('Esta pieza cambió: recargá la pantalla.', 409)
    if (e instanceof ErrorSupabase && e.status === 404) return error('No se encontró la pieza.', 404)
    // Solo el mensaje de errores propios; nunca el objeto entero.
    console.error('piezas: falló el cambio', e instanceof ErrorSupabase ? e.message : 'error interno')
    return error('No se pudo actualizar la pieza. Probá de nuevo en un momento.', 500)
  }
}
