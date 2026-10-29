/**
 * POST /api/piezas/[id]/cambio {instruccion, version}: pedirle a la IA un cambio sobre una pieza (ADR-034).
 *
 * Mismas reglas que el cambio de texto de una promoción (lib/promocion/textos/cambio.ts): el tope vive en
 * Postgres y se chequea ANTES de OpenAI; un resultado inválido se cobra y no se guarda; los rechazos no
 * llaman a nadie. El cambio crea una VERSIÓN NUEVA en borrador (editar_pieza): una pieza aprobada sigue
 * aprobada hasta que se apruebe la nueva.
 */

import { autorizarAgente } from '../agentes/autorizar.ts'
import { CAMBIO_TEXTO, TOPE_USD_DIARIO } from '../agentes/conversacion/limites.ts'
import { costoAproximadoCambioTexto } from '../agentes/conversacion/costos.ts'
import { limpiarPedido } from '../agentes/conversacion/pedido.ts'
import { ejecutarTurno } from '../agentes/conversacion/turno.ts'
import { pedirJson } from '../agentes/estructurado.ts'
import { error, responder, UUID } from '../agentes/http.ts'
import { esObj, type Validacion } from '../agentes/validar.ts'
import type { Plan } from '../estratega/tipos.ts'
import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { rpc, seleccionar } from '../supabase/rest.ts'
import { FORMATO_PIEZA_CAMBIO } from './esquema.ts'
import { COLUMNAS_PIEZA, vistaDePieza, type FilaPieza } from './historial.ts'
import { reemplazarMontos } from './montos.ts'
import { validarPieza } from './piezas.ts'
import { INSTRUCCIONES_CAMBIO_PIEZA, instruccionesRespaldoCambioPieza, mensajeCambioPieza, VERSION_PROMPT_CAMBIO_PIEZA } from './prompt-cambio.ts'
import { rangoSemana } from './semana.ts'
import type { ContextoSemana, Pieza } from './tipos.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

const CLAVES = ['hook', 'copy', 'hashtags', 'cta', 'guion', 'briefVisual', 'altText'] as const
const nuloOTexto = (x: unknown) => x === null || typeof x === 'string'

/**
 * Pone lo que devolvió el modelo sobre la pieza base. Marca, plataforma, formato, fecha e idea de origen
 * nunca salen del modelo. Un monto que no esté en la pieza ni en lo pedido se cambia por [precio] (la llamada
 * ya se pagó: no se tira) y todo pasa por validarPieza, el mismo validador de las ediciones.
 */
export function fusionarCambio(base: Pieza, crudo: unknown, pedidos: string, ctx: ContextoSemana): Validacion<Pieza, 'pieza'> {
  if (!esObj(crudo)) return { ok: false, errores: ['La respuesta no es un objeto.'] }
  const claves = Object.keys(crudo)
  if (claves.length !== CLAVES.length || !CLAVES.every((k) => k in crudo)) return { ok: false, errores: ['La respuesta no tiene los campos pedidos.'] }
  const { hook, copy, hashtags, cta, guion, briefVisual, altText } = crudo
  if (![hook, copy, cta, briefVisual].every((x) => typeof x === 'string') || !nuloOTexto(guion) || !nuloOTexto(altText)) {
    return { ok: false, errores: ['La respuesta tiene campos con el tipo equivocado.'] }
  }
  if (!Array.isArray(hashtags) || !hashtags.every((h) => typeof h === 'string')) return { ok: false, errores: ['Los hashtags tienen que ser una lista de textos.'] }

  const historia = base.formato === 'historia'
  const unida: Pieza = {
    ...base,
    hook: hook as string,
    copy: historia ? '' : (copy as string),
    hashtags: historia ? [] : (hashtags as string[]),
    cta: cta as string,
    // Qué formatos llevan guion y texto alternativo lo manda la base, no el modelo.
    guion: base.guion === null ? null : ((guion as string | null) ?? base.guion),
    briefVisual: briefVisual as string,
    altText: base.altText === null ? null : ((altText as string | null) ?? base.altText),
  }
  const fuente = [base.hook, base.copy, base.cta, base.guion, base.briefVisual, base.altText, ...base.hashtags, pedidos].filter((t): t is string => typeof t === 'string').join('\n')
  return validarPieza(reemplazarMontos(unida, fuente), ctx, { origen: 'edicion', base })
}

export async function manejarCambioPiezaIA(request: Request, id: string, entorno: Entorno, f: Fetch): Promise<Response> {
  const ctx = await autorizarAgente(request, entorno, 'MODELO_CONTENIDISTA', 'pedir cambios de piezas', f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase, apiKey, modelo } = ctx

  if (!UUID.test(id)) return error('No se encontró la pieza.', 404)
  const cuerpo = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (cuerpo === null || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return error('El pedido no es válido.', 400)
  const pedido = limpiarPedido(cuerpo.instruccion)
  if (!pedido.ok) return error(pedido.error, 400)
  const version = cuerpo.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return error('Falta la versión de la pieza que estás viendo.', 400)

  try {
    const [fila] = await seleccionar<FilaPieza>(
      supabase,
      'piezas',
      { select: COLUMNAS_PIEZA, id: `eq.${id}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
      f,
    )
    if (!fila) return error('No se encontró la pieza.', 404)
    if (fila.version !== version) return error('Esta pieza cambió: recargá la pantalla.', 409)
    if (fila.estado === 'descartada' || fila.estado === 'reemplazada') return error('Esta versión ya no está vigente: recargá la pantalla.', 409)

    const [plan] = await seleccionar<{ plan: Plan }>(
      supabase,
      'planes',
      { select: 'plan', id: `eq.${fila.plan_id}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
      f,
    )
    const rango = plan ? rangoSemana(plan.plan, fila.semana) : null
    if (!plan || !rango) return error('No se pudo leer la semana del plan de esta pieza.', 422)
    const contexto: ContextoSemana = { plan: plan.plan, semana: fila.semana, desde: rango.desde, hasta: rango.hasta, fuente: '' }
    const antes = fila.pieza

    const r = await ejecutarTurno<Pieza, FilaPieza>(
      {
        s: supabase,
        org: ORGANIZACION_PILOTO_ID,
        objeto: 'pieza',
        objetoId: id,
        pedido: pedido.pedido,
        usuarioId,
        estimadoUsd: costoAproximadoCambioTexto(modelo) ?? 0.002,
        topes: { maxTurnos: CAMBIO_TEXTO.maxTurnos, topeUsdItem: CAMBIO_TEXTO.topeUsdItem, topeUsdDiario: TOPE_USD_DIARIO },
        modelo,
        version: VERSION_PROMPT_CAMBIO_PIEZA,
        llamar: (anteriores) =>
          pedirJson(
            {
              apiKey,
              modelo,
              entrada: mensajeCambioPieza({ pieza: antes, anteriores, pedido: pedido.pedido }),
              instrucciones: INSTRUCCIONES_CAMBIO_PIEZA,
              respaldo: instruccionesRespaldoCambioPieza(),
              formato: FORMATO_PIEZA_CAMBIO,
              etiqueta: 'contenidista-cambio',
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
          const v = fusionarCambio(antes, crudo, pedido.pedido, contexto)
          return v.ok ? { ok: true, valor: v.pieza } : v
        },
        // Versión nueva en borrador con la versión que se veía: si cambió mientras tanto, 409 y no se pisa.
        aplicar: (pieza) => rpc<FilaPieza>(supabase, 'editar_pieza', { p_id: id, p_version: version, p_pieza: pieza, p_usuario: usuarioId }, f),
        respuesta: (pieza, nueva) => ({ piezaId: nueva.id, version: nueva.version, antes, despues: pieza }),
      },
      f,
    )
    if (!r.ok) return error(r.error, r.status)
    return responder({ pieza: vistaDePieza(r.valor), cambio: { turno: r.turno, costoUsd: r.costoUsd } }, 200)
  } catch (e) {
    console.error('piezas: falló el cambio con IA', e instanceof Error ? e.name : 'error interno')
    return error('No se pudo pedir el cambio. Probá de nuevo en un momento.', 500)
  }
}
