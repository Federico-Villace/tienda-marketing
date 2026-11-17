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
import { validarMotosExtra } from './varias/validar.ts'
import { vistaDePromocion } from './vista.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

export async function manejarCreacion(request: Request, entorno: Entorno, f: Fetch): Promise<Response> {
  const ctx = await autorizarMiembro(request, entorno, 'crear promociones', f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase } = ctx

  const cuerpo = await request.json().catch(() => null)
  // `motos` (ADR-041): las motos 2 a 4 de una placa de varias motos. La moto principal es la de siempre.
  const { motos: motosCrudas, ...resto } = (cuerpo !== null && typeof cuerpo === 'object' && !Array.isArray(cuerpo) ? cuerpo : {}) as Record<string, unknown>
  const hayMotos = motosCrudas !== undefined
  const validado = validarPedido(cuerpo !== null && typeof cuerpo === 'object' && !Array.isArray(cuerpo) ? resto : cuerpo)
  const extras = hayMotos ? validarMotosExtra(motosCrudas, { fotoPrincipalId: validado.ok ? validado.pedido.fotoId : null }) : null
  const errores = [...(validado.ok ? [] : validado.errores), ...(extras && !extras.ok ? extras.errores : [])]
  if (!validado.ok || (extras && !extras.ok)) return responder({ error: 'Revisá los datos de la promoción.', errores }, 400)
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

    // Las fotos de las otras motos: tienen que ser de la organización, de moto y estar vivas (una sola consulta).
    if (extras?.ok) {
      const ids = extras.motos.map((m) => m.fotoId)
      const fotos = await seleccionar<{ id: string; ruta: string | null; borrada_en: string | null }>(
        supabase,
        'fotos',
        { select: 'id,ruta,borrada_en', id: `in.(${ids.join(',')})`, uso: 'eq.moto', organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}` },
        f,
      )
      if (ids.some((id) => !fotos.some((x) => x.id === id))) return error('No se encontró la foto de alguna moto.', 404)
      if (fotos.some((x) => x.borrada_en !== null || x.ruta === null)) return error('Alguna foto se borró: subí otra.', 410)
    }

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
        ...(extras?.ok ? { motos_extra: extras.motos } : {}),
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
