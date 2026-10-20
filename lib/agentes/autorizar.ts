/**
 * Puerta común de los agentes: sesión, rol, configuración y modelo con precio.
 *
 * Todo lo que gasta o escribe pasa por acá antes de tocar OpenAI. Devuelve el
 * contexto o una Response lista para responder (401/403/500/503). Ningún mensaje
 * lleva OPENAI_API_KEY.
 */

import { HEADER_USUARIO } from '../auth/acceso.ts'
import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { ErrorSupabase, seleccionar, type Supabase } from '../supabase/rest.ts'
import { tienePrecio } from './precios.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

export const MODELO_POR_DEFECTO = 'gpt-6-luna'

export type Miembro = {
  readonly usuarioId: string
  readonly supabase: Supabase
  readonly rol: string
}
export type ContextoAgente = Miembro & { readonly apiKey: string; readonly modelo: string }

const error = (mensaje: string, status: number) => Response.json({ error: mensaje }, { status })

/** Sesión + rol, sin OpenAI (acciones que no cuestan, como aprobar un plan). */
export async function autorizarMiembro(
  request: Request,
  entorno: Entorno,
  accion: string,
  f: Fetch,
): Promise<Miembro | Response> {
  // Lo pone proxy.ts tras verificar la sesión, y pisa cualquiera que mande el cliente.
  const usuarioId = request.headers.get(HEADER_USUARIO)
  if (!usuarioId) return error('Iniciá sesión.', 401)

  const url = entorno.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const secretKey = entorno.SUPABASE_SECRET_KEY?.trim()
  if (!url || !secretKey) return error('Faltan las variables de Supabase.', 500)
  const supabase = { url, secretKey }

  try {
    const [miembro] = await seleccionar<{ rol: string }>(
      supabase,
      'miembros',
      { select: 'rol', organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, usuario_id: `eq.${usuarioId}` },
      f,
    )
    if (!miembro || miembro.rol === 'lector') return error(`Tu rol no permite ${accion}.`, 403)
    return { usuarioId, supabase, rol: miembro.rol }
  } catch (e) {
    console.error('autorizar: falló', e instanceof ErrorSupabase ? e.message : 'error interno')
    return error('No se pudo verificar tu acceso. Probá de nuevo en un momento.', 500)
  }
}

/** Como autorizarMiembro, más la clave de OpenAI y un modelo con precio. */
export async function autorizarAgente(
  request: Request,
  entorno: Entorno,
  varModelo: string,
  accion: string,
  f: Fetch,
): Promise<ContextoAgente | Response> {
  if (!request.headers.get(HEADER_USUARIO)) return error('Iniciá sesión.', 401)
  const apiKey = entorno.OPENAI_API_KEY?.trim()
  const url = entorno.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const secretKey = entorno.SUPABASE_SECRET_KEY?.trim()
  if (!url || !secretKey) return error('Faltan las variables de Supabase.', 500)
  if (!apiKey) return error('Falta OPENAI_API_KEY: el agente está deshabilitado.', 503)

  // Un modelo sin precio no se usa: no se gasta lo que no se puede calcular.
  const modelo = entorno[varModelo]?.trim() || MODELO_POR_DEFECTO
  if (!tienePrecio(modelo)) {
    return error(`El modelo "${modelo}" no tiene precio cargado: no se puede calcular el costo.`, 500)
  }

  const miembro = await autorizarMiembro(request, entorno, accion, f)
  if (miembro instanceof Response) return miembro
  return { ...miembro, apiKey, modelo }
}
