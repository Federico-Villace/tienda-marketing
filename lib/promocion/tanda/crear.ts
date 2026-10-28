/**
 * POST /api/tandas: crea la tanda y sus N promociones hijas (una por marca) de
 * una sola vez (ADR-028).
 *
 * No cuesta plata ni llama a nadie de afuera. La atomicidad la da la RPC
 * crear_tanda_promocion: o se crean la tanda y todas las hijas, o ninguna.
 * El precio se guarda tal cual lo validó validarDatos.
 */

import { autorizarMiembro } from '../../agentes/autorizar.ts'
import { error, responder } from '../../agentes/http.ts'
import { ORGANIZACION_PILOTO_ID } from '../../organizacion.ts'
import { ErrorSupabase, rpc, seleccionar } from '../../supabase/rest.ts'
import { validarPedidoTanda } from '../datos.ts'
import { crearLote } from '../lote/crear.ts'
import { validarPedidoLote } from '../lote/validar.ts'
import type { FilaPromocion } from '../tipos.ts'
import { vistaDePromocion } from '../vista.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

export async function manejarCreacionTanda(request: Request, entorno: Entorno, f: Fetch): Promise<Response> {
  const ctx = await autorizarMiembro(request, entorno, 'crear promociones', f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase } = ctx

  const cuerpo = await request.json().catch(() => null)

  // `tipo` ausente o 'marcas' = la tanda de siempre (una moto en N marcas); 'motos' y 'textos' son lotes (ADR-032).
  const tipo = cuerpo !== null && typeof cuerpo === 'object' && !Array.isArray(cuerpo) ? (cuerpo as Record<string, unknown>).tipo : undefined
  if (tipo === 'motos' || tipo === 'textos') {
    const lote = validarPedidoLote(cuerpo)
    if (!lote.ok) return responder({ error: 'Revisá los datos del lote.', errores: lote.errores }, 400)
    return crearLote(supabase, usuarioId, lote.pedido, f)
  }
  if (tipo !== undefined && tipo !== 'marcas') return responder({ error: 'El tipo de tanda no existe.', errores: ['El tipo tiene que ser "marcas", "motos" o "textos".'] }, 400)
  if (tipo === 'marcas') delete (cuerpo as Record<string, unknown>).tipo

  const validado = validarPedidoTanda(cuerpo)
  if (!validado.ok) return responder({ error: 'Revisá los datos de la promoción.', errores: validado.errores }, 400)
  const { pedido } = validado

  try {
    const [foto] = await seleccionar<{ id: string; ruta: string | null; borrada_en: string | null }>(
      supabase,
      'fotos',
      { select: 'id,ruta,borrada_en', id: `eq.${pedido.fotoId}`, uso: 'eq.moto', organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
      f,
    )
    if (!foto) return error('No se encontró la foto.', 404)
    if (foto.borrada_en !== null || foto.ruta === null) return error('La foto se borró: subí otra.', 410)

    const creada = await rpc<{ tandaId: string; promociones: FilaPromocion[] }>(
      supabase,
      'crear_tanda_promocion',
      {
        p_org: ORGANIZACION_PILOTO_ID,
        p_marcas: pedido.marcaIds,
        p_modelo: pedido.modelo,
        p_datos: pedido.datos,
        p_foto: pedido.fotoId,
        p_aspecto: pedido.aspecto,
        p_usuario: usuarioId,
      },
      f,
    )
    return responder({ tanda: { id: creada.tandaId }, promociones: creada.promociones.map(vistaDePromocion) }, 201)
  } catch (e) {
    if (e instanceof ErrorSupabase) {
      // PostgREST traduce PT404 → 404, 22023 → 400 y el índice único (23505) → 409.
      if (e.status === 404) return error('No se encontró la foto.', 404)
      if (e.status === 400) return error('Revisá las marcas: tienen que ser entre 2 y 7, distintas.', 400)
      if (e.status === 409) return error('Alguna de esas marcas ya está en la tanda.', 409)
    }
    console.error('tandas: falló la creación', e instanceof ErrorSupabase ? e.message : 'error interno')
    return error('No se pudo crear la tanda. Probá de nuevo en un momento.', 500)
  }
}
