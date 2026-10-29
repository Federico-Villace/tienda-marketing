/**
 * POST /api/promociones/[id]/textos/cambio {instruccion, revision}: pedirle a la IA un cambio sobre el
 * texto elegido de la promoción (ADR-034).
 *
 * Reglas duras que se cumplen en este archivo:
 * - Al modelo le llegan los datos que cargó la persona, el texto actual, hasta 4 pedidos anteriores y el
 *   pedido de ahora: nunca filas, ids, permalinks ni claves (#2).
 * - Cuesta centavos, así que no hay compuerta de click: el botón dice el costo y el TOPE vive en Postgres
 *   (abrir_turno: turnos y gasto por ítem, gasto del día) y se chequea ANTES de llamar a OpenAI (#3).
 * - Un texto inválido se cobra (la llamada ya pasó) y no se aplica. Los rechazos no llaman a nadie.
 * - Ninguna respuesta ni log lleva OPENAI_API_KEY.
 */

import { autorizarAgente } from '../../agentes/autorizar.ts'
import { limpiarPedido } from '../../agentes/conversacion/pedido.ts'
import { CAMBIO_TEXTO, TOPE_USD_DIARIO } from '../../agentes/conversacion/limites.ts'
import { costoAproximadoCambioTexto } from '../../agentes/conversacion/costos.ts'
import { ejecutarTurno } from '../../agentes/conversacion/turno.ts'
import { pedirJson } from '../../agentes/estructurado.ts'
import { error, responder, UUID } from '../../agentes/http.ts'
import { ORGANIZACION_PILOTO_ID } from '../../organizacion.ts'
import { rpc } from '../../supabase/rest.ts'
import { camposDeCopy } from '../cambios.ts'
import { fuenteMontos } from '../datos.ts'
import { MENSAJE_REVISION } from '../errores.ts'
import { marcaPorId } from '../marca.ts'
import { leerPromocion } from '../repositorio.ts'
import type { CopyPromo, FilaPromocion } from '../tipos.ts'
import { vistaDePromocion } from '../vista.ts'
import { FORMATO_COPY } from './esquema.ts'
import { INSTRUCCIONES_CAMBIO, instruccionesRespaldoCambio, mensajeCambio, VERSION_PROMPT_CAMBIO } from './prompt-cambio.ts'
import { validarCopyDeIA } from './validar.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

export async function manejarCambioTexto(request: Request, id: string, entorno: Entorno, f: Fetch): Promise<Response> {
  const ctx = await autorizarAgente(request, entorno, 'MODELO_CONTENIDISTA', 'pedir cambios de texto', f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase, apiKey, modelo } = ctx

  if (!UUID.test(id)) return error('No se encontró la promoción.', 404)
  const cuerpo = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (cuerpo === null || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return error('El pedido no es válido.', 400)
  const pedido = limpiarPedido(cuerpo.instruccion)
  if (!pedido.ok) return error(pedido.error, 400)
  const revision = cuerpo.revision
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1) {
    return error('Falta la revisión de la promoción que estás viendo.', 400)
  }

  const promo = await leerPromocion(supabase, id, f).catch(() => 'falló' as const)
  if (promo === 'falló') return error('No se pudo leer la promoción. Probá de nuevo en un momento.', 500)
  if (!promo) return error('No se encontró la promoción.', 404)
  if (promo.estado !== 'borrador') return error('Volvé a editar la promoción para pedir cambios.', 409)
  if (promo.revision !== revision) return error(MENSAJE_REVISION, 409)
  if (promo.copy === null) return error('Primero elegí un texto: no hay nada que cambiar.', 422)
  const marca = marcaPorId(promo.marca_id)
  if (!marca) return error('La marca de esta promoción ya no existe.', 422)

  const antes: CopyPromo = promo.copy
  try {
    const r = await ejecutarTurno<CopyPromo, FilaPromocion>(
      {
        s: supabase,
        org: ORGANIZACION_PILOTO_ID,
        objeto: 'promocion',
        objetoId: id,
        pedido: pedido.pedido,
        usuarioId,
        estimadoUsd: costoAproximadoCambioTexto(modelo) ?? 0.002,
        topes: { maxTurnos: CAMBIO_TEXTO.maxTurnos, topeUsdItem: CAMBIO_TEXTO.topeUsdItem, topeUsdDiario: TOPE_USD_DIARIO },
        modelo,
        version: VERSION_PROMPT_CAMBIO,
        llamar: (anteriores) =>
          pedirJson(
            {
              apiKey,
              modelo,
              entrada: mensajeCambio({ marca: marca.nombre, usuarioIg: marca.usuarioIg, modelo: promo.modelo, datos: promo.datos, textoActual: antes, anteriores, pedido: pedido.pedido }),
              instrucciones: INSTRUCCIONES_CAMBIO,
              respaldo: instruccionesRespaldoCambio(),
              formato: FORMATO_COPY,
              etiqueta: 'promocion-texto-cambio',
            },
            f,
          ),
        validar: (texto) => {
          let crudo: unknown
          try {
            crudo = JSON.parse(texto)
          } catch {
            return { ok: false, errores: ['La respuesta no es JSON.'] }
          }
          // Respaldan un monto: el precio cargado, el detalle, las indicaciones, el texto actual y lo que pidió la persona.
          const fuente = [fuenteMontos(promo.datos), antes.titular, antes.hook, antes.copy, antes.cta, antes.altText, ...antes.hashtags, pedido.pedido].join('\n')
          const v = validarCopyDeIA(crudo, { usuarioIg: marca.usuarioIg, fuente })
          return v.ok ? { ok: true, valor: v.copy } : v
        },
        // Se aplica con la revisión que se leyó: si la persona tocó algo en el medio, 409 y no se pisa.
        aplicar: (copy) =>
          rpc<FilaPromocion>(
            supabase,
            'editar_promocion',
            { p_id: id, p_revision: promo.revision, p_campos: camposDeCopy(promo, copy, { editado: true }), p_usuario: usuarioId },
            f,
          ),
        respuesta: (copy) => ({ antes, despues: copy }),
      },
      f,
    )
    if (!r.ok) return error(r.error, r.status)
    return responder({ promocion: vistaDePromocion(r.valor), cambio: { turno: r.turno, costoUsd: r.costoUsd } }, 200)
  } catch (e) {
    console.error('promociones: falló el cambio de texto', e instanceof Error ? e.name : 'error interno')
    return error('No se pudo pedir el cambio. Probá de nuevo en un momento.', 500)
  }
}
