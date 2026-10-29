/** Acceso a conversaciones y turnos: solo por el backend, con la clave secreta (regla #5). */

import { ErrorSupabase, rpc, seleccionar, type Supabase } from '../../supabase/rest.ts'
import { ORGANIZACION_PILOTO_ID } from '../../organizacion.ts'
import type { ArgsAbrir, Objeto, TokensTurno, TurnoVista } from './tipos.ts'

type Fetch = typeof fetch

export class ErrorTurno extends Error {
  override name = 'ErrorTurno'
  readonly status: number
  readonly mensaje: string
  constructor(status: number, mensaje: string) {
    super(mensaje)
    this.status = status
    this.mensaje = mensaje
  }
}

const MENSAJES: Record<number, string> = {
  404: 'No se encontró lo que querés cambiar.',
  409: 'Ya hay un pedido en curso. Esperá a que termine.',
  429: 'Llegaste al tope de cambios por IA (de este ítem o de hoy). Probá más tarde o editá a mano.',
}

export async function abrirTurno(s: Supabase, a: ArgsAbrir, f: Fetch): Promise<{ conversacionId: string; turnoId: string; turno: number }> {
  try {
    return await rpc(
      s,
      'abrir_turno',
      {
        p_org: a.org,
        p_objeto: a.objeto,
        p_objeto_id: a.objetoId,
        p_pedido: a.pedido,
        p_usuario: a.usuarioId,
        p_estimado: a.estimadoUsd,
        p_max_turnos: a.topes.maxTurnos,
        p_tope: a.topes.topeUsdItem,
        p_tope_diario: a.topes.topeUsdDiario,
      },
      f,
    )
  } catch (e) {
    if (e instanceof ErrorSupabase && MENSAJES[e.status]) throw new ErrorTurno(e.status, MENSAJES[e.status]!)
    throw e
  }
}

export const cerrarTurno = (
  s: Supabase,
  a: { turnoId: string; respuesta: Record<string, unknown>; modelo: string; version: string; tokens: TokensTurno; costoUsd: number },
  f: Fetch,
) =>
  rpc(
    s,
    'cerrar_turno',
    { p_turno: a.turnoId, p_respuesta: a.respuesta, p_modelo: a.modelo, p_version: a.version, p_tokens: a.tokens, p_costo: a.costoUsd },
    f,
  )

export const fallarTurno = (
  s: Supabase,
  a: { turnoId: string; error: string; costoUsd: number; tokens?: TokensTurno },
  f: Fetch,
) => rpc(s, 'fallar_turno', { p_turno: a.turnoId, p_error: a.error, p_costo: a.costoUsd, p_tokens: a.tokens ?? {} }, f)

type FilaTurno = {
  id: string
  turno: number
  pedido: string
  estado: TurnoVista['estado']
  respuesta: Record<string, unknown> | null
  error: string | null
  costo_usd: number | string
  creado_en: string
}
const COLUMNAS = 'id,turno,pedido,estado,respuesta,error,costo_usd,creado_en'

const vista = (r: FilaTurno): TurnoVista => ({
  id: r.id, turno: r.turno, pedido: r.pedido, estado: r.estado, respuesta: r.respuesta, error: r.error,
  costoUsd: Number(r.costo_usd), creadoEn: r.creado_en,
})

/** Los turnos de una conversación, del primero al último. */
export async function leerTurnos(s: Supabase, conversacionId: string, f: Fetch): Promise<TurnoVista[]> {
  const filas = await seleccionar<FilaTurno>(
    s,
    'turnos_conversacion',
    { select: COLUMNAS, conversacion_id: `eq.${conversacionId}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, order: 'turno.asc' },
    f,
  )
  return filas.map(vista)
}

/** La conversación de una promoción o de una pieza (por su raíz) y sus turnos; [] si nunca se pidió nada. */
export async function leerConversacion(s: Supabase, objeto: Objeto, objetoId: string, f: Fetch): Promise<TurnoVista[]> {
  const columna = objeto === 'promocion' ? 'promocion_id' : 'pieza_raiz_id'
  const [conv] = await seleccionar<{ id: string }>(
    s,
    'conversaciones',
    { select: 'id', [columna]: `eq.${objetoId}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
    f,
  )
  return conv ? leerTurnos(s, conv.id, f) : []
}

/** Las conversaciones de varios ítems de una vez (p. ej. todas las piezas de una pantalla): id del objeto -> turnos. */
export async function leerConversaciones(s: Supabase, objeto: Objeto, ids: readonly string[], f: Fetch): Promise<Map<string, TurnoVista[]>> {
  const salida = new Map<string, TurnoVista[]>()
  if (ids.length === 0) return salida
  const columna = objeto === 'promocion' ? 'promocion_id' : 'pieza_raiz_id'
  const convs = await seleccionar<{ id: string; promocion_id?: string | null; pieza_raiz_id?: string | null }>(
    s,
    'conversaciones',
    { select: `id,${columna}`, [columna]: `in.(${ids.join(',')})`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}` },
    f,
  )
  if (convs.length === 0) return salida
  const filas = await seleccionar<FilaTurno & { conversacion_id: string }>(
    s,
    'turnos_conversacion',
    {
      select: `${COLUMNAS},conversacion_id`,
      conversacion_id: `in.(${convs.map((c) => c.id).join(',')})`,
      organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`,
      order: 'turno.asc',
    },
    f,
  )
  for (const c of convs) {
    const objetoId = (objeto === 'promocion' ? c.promocion_id : c.pieza_raiz_id) ?? ''
    salida.set(objetoId, filas.filter((x) => x.conversacion_id === c.id).map(vista))
  }
  return salida
}
