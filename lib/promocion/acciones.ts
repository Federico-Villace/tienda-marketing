/**
 * Acciones de PATCH /api/promociones/[id] {accion, revision}: aprobar, volver a editar, descartar.
 *
 * Todas son gratis y las ejecuta una RPC transaccional que bloquea la fila: un doble
 * click no crea dos aprobaciones (el segundo ve la promoción ya aprobada → 409). El
 * snapshot de lo aprobado lo arma la base desde la fila, jamás el cliente.
 */

import { error, responder } from '../agentes/http.ts'
import { rpc, type Supabase } from '../supabase/rest.ts'
import { MENSAJE_REVISION, respuestaDeError } from './errores.ts'
import { firmarPlaca, obtenerPlaca, type Componer } from './placa.ts'
import { leerPromocion } from './repositorio.ts'
import type { FilaPromocion } from './tipos.ts'
import { vistaDePromocion } from './vista.ts'

type Fetch = typeof fetch

export const ACCIONES = ['aprobar', 'reabrir', 'descartar'] as const
export type Accion = (typeof ACCIONES)[number]
export const esAccion = (x: unknown): x is Accion => typeof x === 'string' && (ACCIONES as readonly string[]).includes(x)

type FilaAprobacion = { id: string; version: number; aprobado_en: string; aprobado_por: string }

export async function ejecutarAccion(
  ctx: { usuarioId: string; supabase: Supabase },
  id: string,
  accion: Accion,
  revision: number,
  f: Fetch,
  componer: Componer,
): Promise<Response> {
  const { usuarioId, supabase } = ctx
  try {
    const promo = await leerPromocion(supabase, id, f)
    if (!promo) return error('No se encontró la promoción.', 404)

    if (accion === 'reabrir') {
      if (promo.estado !== 'aprobada') return error('Solo se puede volver a editar una promoción aprobada.', 409)
      if (promo.revision !== revision) return error(MENSAJE_REVISION, 409)
      const abierta = await rpc<FilaPromocion>(supabase, 'reabrir_promocion', { p_id: id, p_revision: revision, p_usuario: usuarioId }, f)
      return responder({ promocion: vistaDePromocion(abierta) }, 200)
    }

    if (promo.estado === 'aprobada') return error('Esta promoción ya está aprobada.', 409)
    if (promo.estado === 'descartada') return error('Esta promoción está descartada.', 409)
    if (promo.revision !== revision) return error(MENSAJE_REVISION, 409)

    if (accion === 'descartar') {
      const descartada = await rpc<FilaPromocion>(supabase, 'descartar_promocion', { p_id: id, p_revision: revision, p_usuario: usuarioId }, f)
      return responder({ promocion: vistaDePromocion(descartada) }, 200)
    }

    // aprobar: la placa tiene que corresponder a lo que se aprueba; si no está al día, se compone ahora.
    const placa = await obtenerPlaca(supabase, promo, f, componer)
    if (placa instanceof Response) return placa
    const aprobacion = await rpc<FilaAprobacion>(
      supabase,
      'aprobar_promocion',
      { p_id: id, p_revision: revision, p_placa_ruta: placa.ruta, p_placa_hash: placa.hash, p_usuario: usuarioId },
      f,
    )
    const aprobada = (await leerPromocion(supabase, id, f)) ?? promo
    return responder(
      {
        promocion: vistaDePromocion(aprobada),
        aprobacion: { id: aprobacion.id, version: aprobacion.version, aprobadoEn: aprobacion.aprobado_en, aprobadoPor: aprobacion.aprobado_por },
        url: await firmarPlaca(supabase, placa.ruta, f),
      },
      200,
    )
  } catch (e) {
    return respuestaDeError(e, `la acción ${accion}`)
  }
}
