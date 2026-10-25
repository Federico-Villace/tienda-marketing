/**
 * POST /api/promociones: crea el borrador desde el paso 1.
 *
 * No cuesta plata ni llama a nadie de afuera. El precio del body se guarda tal
 * cual lo validó validarDatos: jamás se reescribe ni se redondea.
 */

import { autorizarMiembro } from '../agentes/autorizar.ts'
import { error, responder } from '../agentes/http.ts'
import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { ErrorSupabase, insertar, seleccionar } from '../supabase/rest.ts'
import { validarPedido } from './datos.ts'
import type { FilaPromocion } from './tipos.ts'
import { vistaDePromocion } from './vista.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

export async function manejarCreacion(request: Request, entorno: Entorno, f: Fetch): Promise<Response> {
  const ctx = await autorizarMiembro(request, entorno, 'crear promociones', f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase } = ctx

  const cuerpo = await request.json().catch(() => null)
  const validado = validarPedido(cuerpo)
  if (!validado.ok) return responder({ error: 'Revisá los datos de la promoción.', errores: validado.errores }, 400)
  const { pedido } = validado

  try {
    const [foto] = await seleccionar<{ id: string; ruta: string | null; borrada_en: string | null }>(
      supabase,
      'fotos',
      { select: 'id,ruta,borrada_en', id: `eq.${pedido.fotoId}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
      f,
    )
    if (!foto) return error('No se encontró la foto.', 404)
    if (foto.borrada_en !== null || foto.ruta === null) return error('La foto se borró: subí otra.', 410)

    const creada = await insertar<FilaPromocion>(
      supabase,
      'promociones',
      {
        organizacion_id: ORGANIZACION_PILOTO_ID,
        marca_id: pedido.marcaId,
        modelo: pedido.modelo,
        datos: pedido.datos,
        foto_id: pedido.fotoId,
        aspecto: pedido.aspecto,
        creado_por: usuarioId,
        actualizado_por: usuarioId,
      },
      f,
    )
    return responder({ promocion: vistaDePromocion(creada) }, 201)
  } catch (e) {
    console.error('promociones: falló la creación', e instanceof ErrorSupabase ? e.message : 'error interno')
    return error('No se pudo crear la promoción. Probá de nuevo en un momento.', 500)
  }
}
