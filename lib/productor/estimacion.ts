/**
 * POST /api/generaciones: paso 1 de la compuerta (regla dura #3).
 *
 * Calcula la estimación EN EL SERVIDOR y la guarda como fila `estimada` que
 * vence a los 15 minutos. No llama a Gemini ni gasta nada. El precio jamás se
 * lee del cliente: cualquier campo de costo en el body se ignora.
 */

import { error, responder, UUID } from '../agentes/http.ts'
import type { Pieza } from '../contenidista/tipos.ts'
import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { ErrorSupabase, insertar, rpc, seleccionar } from '../supabase/rest.ts'
import { autorizarProductor } from './autorizar.ts'
import { estimarImagenes, MAX_IMAGENES, PRECIOS_IMAGEN, tienePrecioImagen } from './precios.ts'
import { aspectoDe, promptImagen, VERSION_PROMPT_IMAGEN } from './prompt.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

export const VIGENCIA_ESTIMACION_MS = 15 * 60_000

export async function manejarEstimacion(
  request: Request,
  entorno: Entorno,
  f: Fetch,
  ahora: () => number = Date.now,
): Promise<Response> {
  const ctx = await autorizarProductor(request, entorno, 'generar imágenes', f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase, topeUsd, motorPorDefecto } = ctx

  // Solo se leen estas tres claves: el resto (precios incluidos) se descarta.
  const cuerpo = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (cuerpo === null || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return error('El pedido no es válido.', 400)
  const { piezaId, cantidad } = cuerpo
  if (typeof piezaId !== 'string' || !UUID.test(piezaId)) return error('Falta la pieza.', 400)
  if (typeof cantidad !== 'number' || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_IMAGENES) {
    return error(`La cantidad tiene que ser un entero entre 1 y ${MAX_IMAGENES}.`, 400)
  }
  const motor = cuerpo.motor === undefined ? motorPorDefecto : cuerpo.motor
  if (typeof motor !== 'string' || !tienePrecioImagen(motor)) {
    return error(`Motor desconocido. Los disponibles: ${Object.keys(PRECIOS_IMAGEN).join(', ')}.`, 400)
  }

  try {
    const [fila] = await seleccionar<{ id: string; raiz_id: string; estado: string; pieza: Pieza }>(
      supabase,
      'piezas',
      { select: 'id,raiz_id,estado,pieza', id: `eq.${piezaId}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
      f,
    )
    if (!fila) return error('No se encontró la pieza.', 404)
    if (fila.estado !== 'aprobada') return error('Solo se generan imágenes de piezas aprobadas.', 422)
    const aspecto = aspectoDe(fila.pieza.formato, fila.pieza.plataforma)
    if (!aspecto) return error(`El formato "${fila.pieza.formato}" no genera imágenes: solo imagen, carrusel e historia.`, 422)

    const e = estimarImagenes(motor, cantidad)
    const venceEn = new Date(ahora() + VIGENCIA_ESTIMACION_MS).toISOString()
    const creada = await insertar<{ id: string }>(
      supabase,
      'generaciones',
      {
        organizacion_id: ORGANIZACION_PILOTO_ID,
        tipo: 'imagen',
        motor,
        prompt: promptImagen(fila.pieza, aspecto),
        parametros: {
          aspecto,
          image_size: '1K',
          mime_type: 'image/jpeg',
          thinking: PRECIOS_IMAGEN[motor]!.pensamiento,
        },
        cantidad,
        aspecto,
        pieza_id: fila.id,
        pieza_raiz_id: fila.raiz_id,
        creado_por: usuarioId,
        version_prompt: VERSION_PROMPT_IMAGEN,
        // Lo que se guarda y se compara con el tope es el TOPE por imagen (conservador).
        costo_estimado_usd: e.topeTotalUsd,
        vence_en: venceEn,
      },
      f,
    )
    const gastadoUsd = Number(await rpc<number>(supabase, 'gasto_generaciones_mes', { p_org: ORGANIZACION_PILOTO_ID }, f)) || 0

    return responder(
      {
        id: creada.id,
        costoEstimadoUsd: e.topeTotalUsd,
        generacion: {
          id: creada.id,
          motor,
          cantidad,
          aspecto,
          porImagenUsd: e.porImagenUsd,
          listaUsd: e.totalUsd,
          costoEstimadoUsd: e.topeTotalUsd,
          venceEn,
        },
        mes: { gastadoUsd, topeUsd },
        excedeTope: gastadoUsd + e.topeTotalUsd > topeUsd,
      },
      201,
    )
  } catch (err) {
    console.error('generaciones: falló', err instanceof ErrorSupabase ? err.message : 'error interno')
    return error('No se pudo preparar la estimación. Probá de nuevo en un momento.', 500)
  }
}
