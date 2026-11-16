/**
 * POST /api/creativos/[id]/verificacion: volver a revisar los textos de UNA imagen de copia fiel cuya revisión falló (ADR-040). Cuesta plata
 * (una llamada de visión), así que tiene su propia compuerta, igual de estricta que la de la generación. Orden inviolable:
 *   1. autorizar (sesión, rol, GEMINI_API_KEY, tope válido): el lector no puede
 *   2. leer la imagen y su generación y RECALCULAR el precio en el servidor; si no coincide con lo que aceptó la persona, 409
 *   3. descargar la imagen ANTES de reservar (si Storage falla no queda nada reservado)
 *   4. RPC reservar_verificacion_texto (atómica: tope mensual, una sola en vuelo, sin repetir una ya revisada)
 *   5. recién ahí, UNA llamada a Gemini
 * Cualquier fallo en 1-4 corta antes de Gemini. Una revisión que ya dio ok o difiere NO se repite: si difiere se genera otra imagen.
 */

import { error, responder, UUID } from '../../agentes/http.ts'
import { ORGANIZACION_PILOTO_ID } from '../../organizacion.ts'
import { autorizarProductor } from '../../productor/autorizar.ts'
import { BUCKET_CREATIVOS, redondear } from '../../productor/ejecutar.ts'
import { ErrorSupabase, rpc, seleccionar, type Supabase } from '../../supabase/rest.ts'
import { descargarObjeto } from '../../supabase/storage.ts'
import { estimarVerificacion } from './precios.ts'
import type { TextosCopia, VerificacionVista } from './tipos.ts'
import { verificarCreativo } from './verificar.ts'
import { VERSION_COMPARACION } from './comparar.ts'
import { VERSION_PROMPT_VERIFICACION } from './prompt-verificacion.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

async function restante(supabase: Supabase, topeUsd: number, f: Fetch) {
  const gastadoUsd = redondear(Number(await rpc<number>(supabase, 'gasto_generaciones_mes', { p_org: ORGANIZACION_PILOTO_ID }, f)) || 0)
  return { topeUsd, gastadoUsd, restanteUsd: redondear(Math.max(0, topeUsd - gastadoUsd)) }
}

const mimeDe = (m: string | null): 'image/jpeg' | 'image/png' | 'image/webp' => (m === 'image/png' || m === 'image/webp' ? m : 'image/jpeg')

export async function manejarReverificacion(request: Request, creativoId: string, entorno: Entorno, f: Fetch): Promise<Response> {
  const ctx = await autorizarProductor(request, entorno, 'revisar los textos de las imágenes', f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase, apiKey, topeUsd } = ctx

  if (!UUID.test(creativoId)) return error('No se encontró la imagen.', 404)
  // Del cuerpo solo se mira el precio que aceptó la persona: se compara con el del servidor, nunca se usa.
  const cuerpo = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (cuerpo === null || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return error('El pedido no es válido.', 400)
  const { aceptadoUsd } = cuerpo
  if (typeof aceptadoUsd !== 'number' || !Number.isFinite(aceptadoUsd) || aceptadoUsd < 0) return error('Falta el precio que aceptaste.', 400)

  try {
    const [creativo] = await seleccionar<{ id: string; generacion_id: string; ruta: string | null; mime_type: string | null }>(
      supabase,
      'creativos',
      { select: 'id,generacion_id,ruta,mime_type', id: `eq.${creativoId}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
      f,
    )
    if (!creativo) return error('No se encontró la imagen.', 404)
    if (creativo.ruta === null) return error('Esa imagen no se guardó: no se puede revisar.', 410)
    const [gen] = await seleccionar<{ id: string; textos_esperados: TextosCopia | null; textos_hash: string | null; modelo_verificacion: string | null }>(
      supabase,
      'generaciones',
      { select: 'id,textos_esperados,textos_hash,modelo_verificacion', id: `eq.${creativo.generacion_id}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
      f,
    )
    if (!gen) return error('No se encontró la imagen.', 404)
    if (!gen.textos_esperados || !gen.textos_hash || !gen.modelo_verificacion) return error('Esta imagen no es de una copia fiel: no hay textos para revisar.', 422)

    // El precio se recalcula en el servidor: un modelo sin precio no se ejecuta.
    let estimado: number
    try {
      estimado = estimarVerificacion(gen.modelo_verificacion).topeUsd
    } catch {
      console.error('reverificar: modelo de revisión sin precio', { creativoId })
      return error('No se puede revisar: el modelo que lee los textos no tiene precio cargado.', 500)
    }
    if (Math.abs(aceptadoUsd - estimado) > 1e-6) return error('El precio cambió desde que lo viste: volvé a mirarlo.', 409)

    // La imagen se descarga ANTES de la compuerta: si Storage falla no queda nada reservado.
    const bytes = await descargarObjeto(supabase, BUCKET_CREATIVOS, creativo.ruta, f)
    if (bytes.length === 0) throw new Error('La imagen descargada está vacía')

    // LA COMPUERTA. Si esto no vuelve bien, Gemini no se toca.
    let reservada: { id: string }
    try {
      reservada = await rpc<{ id: string }>(
        supabase,
        'reservar_verificacion_texto',
        { p_org: ORGANIZACION_PILOTO_ID, p_creativo: creativo.id, p_modelo: gen.modelo_verificacion, p_version: VERSION_PROMPT_VERIFICACION, p_version_comp: VERSION_COMPARACION, p_estimado: estimado, p_tope: topeUsd, p_usuario: usuarioId },
        f,
      )
    } catch (e) {
      if (!(e instanceof ErrorSupabase)) throw e
      if (e.status === 402) return responder({ error: 'Supera el tope mensual.', ...(await restante(supabase, topeUsd, f)), estimadoUsd: estimado }, 402)
      if (e.status === 409) return error(/ya se revis[óo]/i.test(e.message) ? 'Esta imagen ya se revisó: si los textos difieren, generá otra.' : 'Ya se están revisando los textos de esta imagen: esperá unos segundos.', 409)
      if (e.status === 404) return error('No se encontró la imagen.', 404)
      if (e.status === 422) return error('Esta imagen no es de una copia fiel.', 422)
      throw e
    }

    const r = await verificarCreativo(
      { supabase, apiKey },
      { creativoId: creativo.id, generacionId: gen.id, modelo: gen.modelo_verificacion, bytes, mime: mimeDe(creativo.mime_type), esperado: gen.textos_esperados, textosHash: gen.textos_hash, cobro: 'propio', idReservada: reservada.id },
      f,
    )
    const verificacion: VerificacionVista = {
      id: r.verificacionId,
      estado: r.estado,
      diferencias: r.diferencias,
      avisos: r.avisos,
      puedeReverificar: r.estado === 'error',
      costoReverificarUsd: r.estado === 'error' ? estimado : null,
    }
    return responder({ verificacion, costoUsd: redondear(r.costoUsd) }, 200)
  } catch (e) {
    console.error('reverificar: falló', e instanceof ErrorSupabase ? e.message : 'error interno')
    return error('No se pudo revisar la imagen. Probá de nuevo en un momento.', 500)
  }
}
