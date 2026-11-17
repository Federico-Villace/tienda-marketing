/**
 * Verifica los textos de UNA imagen de copia fiel (ADR-040): un modelo de visión transcribe lo que hay (a ciegas: no recibe lo esperado) y el
 * servidor lo compara con lo que se le pidió escribir a la IA. NUNCA tira: cualquier falla es un estado 'error' con su costo, y un 'ok' solo
 * sale de una comparación ok. Una variante que no está 'ok' no se puede usar en la placa ni aprobar.
 *
 * Dos orígenes de cobro: 'generacion' (la verificación inline de una generación: ya la pagó confirmar_generacion, la fila la crea esta
 * función) y 'propio' (una re-verificación: la fila ya la reservó reservar_verificacion_texto con su compuerta).
 */

import { ErrorGemini } from '../../productor/gemini.ts'
import { pedirJsonConImagen } from '../../productor/gemini-vision.ts'
import { ORGANIZACION_PILOTO_ID } from '../../organizacion.ts'
import { ErrorSupabase, insertar, rpc, type Supabase } from '../../supabase/rest.ts'
import { PRECIOS_VISION } from '../referencia/precios.ts'
import { compararTextos, VERSION_COMPARACION } from './comparar.ts'
import { extraerJson, leerVerificacion, MAX_TEXTOS_VARIAS } from './esquema.ts'
import { promptVerificacion, VERSION_PROMPT_VERIFICACION } from './prompt-verificacion.ts'
import { costoDeVerificacion, estimarVerificacion, SALIDA_TOPE_VERIFICACION, TIMEOUT_VERIFICACION_MS } from './precios.ts'
import type { Diferencia, EstadoVerificacion, TextosCopia } from './tipos.ts'
import { zonaLogo } from './zona-logo.ts'

type Fetch = typeof fetch

export type PedidoVerificacion = {
  readonly creativoId: string
  readonly generacionId: string
  readonly modelo: string
  readonly bytes: Uint8Array
  readonly mime: 'image/jpeg' | 'image/png' | 'image/webp'
  /** Lo que se le pidió escribir a la IA (el snapshot de la generación). */
  readonly esperado: TextosCopia
  /** Hash de ese snapshot (generaciones.textos_hash). */
  readonly textosHash: string
  readonly cobro: 'generacion' | 'propio'
  /** Re-verificación: la fila pendiente que ya reservó la compuerta. */
  readonly idReservada?: string
}

export type ResultadoVerificacion = {
  readonly estado: Exclude<EstadoVerificacion, 'pendiente'>
  readonly costoUsd: number
  /** null si no se pudo ni abrir la fila. */
  readonly verificacionId: string | null
  readonly diferencias: Diferencia[]
  readonly avisos: Diferencia[]
}

type Cierre = {
  estado: 'ok' | 'difiere' | 'error'
  costo: number
  tokensEntrada: number
  tokensSalida: number
  error: string | null
  leido: object | null
  diferencias: Diferencia[]
  avisos: Diferencia[]
  zona: object | null
  fondoLogo: 'claro' | 'oscuro' | null
}

export async function verificarCreativo(ctx: { readonly supabase: Supabase; readonly apiKey: string }, p: PedidoVerificacion, f: Fetch): Promise<ResultadoVerificacion> {
  const { supabase, apiKey } = ctx
  const tope = estimarVerificacion(p.modelo).topeUsd

  // 1. La fila pendiente (la re-verificación ya la tiene). Sin dónde guardar el resultado no se llama al modelo: no se gasta de balde.
  let id: string | null = p.idReservada ?? null
  if (id === null) {
    try {
      const fila = await insertar<{ id: string }>(
        supabase,
        'verificaciones_texto',
        {
          organizacion_id: ORGANIZACION_PILOTO_ID,
          creativo_id: p.creativoId,
          generacion_id: p.generacionId,
          modelo: p.modelo,
          version_prompt: VERSION_PROMPT_VERIFICACION,
          version_comparacion: VERSION_COMPARACION,
          textos_hash: p.textosHash,
          estado: 'pendiente',
          cobro: p.cobro,
          costo_estimado_usd: tope,
        },
        f,
      )
      id = fila.id
    } catch (err) {
      console.error('verificar: no se pudo abrir la verificación', { creativo: p.creativoId, causa: err instanceof ErrorSupabase ? err.message : 'error interno' })
      return { estado: 'error', costoUsd: 0, verificacionId: null, diferencias: [], avisos: [] }
    }
  }

  // 2. Leer la imagen y comparar. Cada rama devuelve cómo se cierra: nada de esto tira.
  const cierre = await leerYComparar(apiKey, p, tope, f)

  // 3. Cerrar (se reintenta una vez, como cerrarGeneracion). Si no cierra, la fila queda pendiente: NO se informa 'ok'.
  let cerrada = false
  for (let intento = 1; intento <= 2 && !cerrada; intento++) {
    try {
      await rpc(
        supabase,
        'cerrar_verificacion_texto',
        {
          p_id: id,
          p_estado: cierre.estado,
          p_leido: cierre.leido,
          p_diferencias: cierre.diferencias,
          p_avisos: cierre.avisos,
          p_zona_logo: cierre.zona,
          p_fondo_logo: cierre.fondoLogo,
          p_costo: cierre.costo,
          p_tokens_entrada: cierre.tokensEntrada,
          p_tokens_salida: cierre.tokensSalida,
          p_error: cierre.error,
        },
        f,
      )
      cerrada = true
    } catch (err) {
      console.error('verificar: no se pudo cerrar la verificación', { id, intento, causa: err instanceof ErrorSupabase ? err.message : 'error interno' })
    }
  }
  return { estado: cerrada ? cierre.estado : 'error', costoUsd: cierre.costo, verificacionId: id, diferencias: cierre.diferencias, avisos: cierre.avisos }
}

async function leerYComparar(apiKey: string, p: PedidoVerificacion, tope: number, f: Fetch): Promise<Cierre> {
  const base: Cierre = { estado: 'error', costo: 0, tokensEntrada: 0, tokensSalida: 0, error: null, leido: null, diferencias: [], avisos: [], zona: null, fondoLogo: null }
  const precio = PRECIOS_VISION[p.modelo]!
  let texto: string
  let usage
  try {
    const r = await pedirJsonConImagen(
      { apiKey, modelo: p.modelo, prompt: promptVerificacion(), imagen: { bytes: p.bytes, mimeType: p.mime }, tokensSalidaTope: SALIDA_TOPE_VERIFICACION, pensamiento: precio.pensamiento, timeoutMs: TIMEOUT_VERIFICACION_MS },
      f,
    )
    texto = r.texto
    usage = r.usage
  } catch (err) {
    const status = err instanceof ErrorGemini ? err.status : 0
    // Un timeout puede haberse cobrado: cuenta el tope. Un error HTTP o de red no tuvo respuesta: 0.
    return { ...base, costo: status === 504 ? tope : 0, error: status === 504 ? 'La revisión tardó demasiado.' : 'No se pudo revisar los textos.' }
  }

  // El modelo corrió: se cobra lo que dice el usage (o el tope), salga lo que salga.
  const c = costoDeVerificacion(p.modelo, usage)
  const cobrado = { ...base, costo: c.usd, tokensEntrada: c.tokensEntrada, tokensSalida: c.tokensSalida }
  const json = extraerJson(texto)
  const lectura = json === null ? null : p.esperado.motos ? leerVerificacion(json, MAX_TEXTOS_VARIAS) : leerVerificacion(json)
  if (lectura === null) return { ...cobrado, error: 'No se pudo interpretar lo que leyó el revisor.' }

  const cmp = compararTextos(p.esperado, lectura)
  const zona = zonaLogo(lectura.logo)
  return {
    ...cobrado,
    estado: cmp.ok ? 'ok' : 'difiere',
    leido: { textos: lectura.textos, logo: lectura.logo, fondoLogo: lectura.fondoLogo },
    diferencias: cmp.ok ? [] : cmp.diferencias,
    avisos: cmp.avisos,
    zona: { ...zona.caja, porDefecto: zona.porDefecto },
    fondoLogo: lectura.fondoLogo,
  }
}
