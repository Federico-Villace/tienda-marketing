/**
 * De la forma orgánica de Meta a las filas de la base. Funciones puras.
 *
 * Los edges anidados (insights, reactions, comments) pueden traer
 * `paging.next` con `access_token=` en la URL. Ningún `crudo` se arma sin
 * pasar por `sinPaginado` (regla dura #4).
 */

import { describirError, ErrorMeta } from '../meta/oauth.ts'
import type { Conversacion, MediaIg, PostFb, ValorDiario } from './meta-organico.ts'
import { fechaAR, fechasEntre, rangoDias } from './transformar.ts'

/** Copia profunda sin ninguna clave `paging`. */
export function sinPaginado<T>(valor: T): T {
  if (Array.isArray(valor)) return valor.map(sinPaginado) as T
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor)
        .filter(([clave]) => clave !== 'paging')
        .map(([clave, v]) => [clave, sinPaginado(v)]),
    ) as T
  }
  return valor
}

/** Mensaje de error apto para persistir o imprimir: sin tokens. */
export function textoSeguro(e: unknown, tokens: readonly string[]): string {
  let texto = e instanceof ErrorMeta ? describirError(e) : e instanceof Error ? e.message : String(e)
  for (const t of tokens.filter(Boolean)) {
    texto = texto.replaceAll(t, '***').replaceAll(encodeURIComponent(t), '***')
  }
  return texto.replace(/access_token=[^&\s"]+/g, 'access_token=***')
}

type Contexto = { readonly organizacionId: string; readonly cuentaId: string }
type Insights = { insights?: { data: { name: string; values: { value: unknown }[] }[] } }

const insight = (m: Insights, nombre: string): number | null => {
  const v = m.insights?.data.find((i) => i.name === nombre)?.values[0]?.value
  return typeof v === 'number' ? v : null
}

const sinInsights = <T extends Insights>({ insights: _, ...resto }: T) => resto

export function tipoIg(m: MediaIg): string {
  if (m.media_product_type === 'REELS') return 'reel'
  if (m.media_type === 'CAROUSEL_ALBUM') return 'carrusel'
  if (m.media_type === 'VIDEO') return 'video'
  return 'imagen'
}

export function tipoFb(p: PostFb): string {
  const a = p.attachments?.data[0]
  if (a?.media_type === 'album') return 'carrusel'
  if (a?.media_type?.startsWith('video') || a?.type?.startsWith('video')) return 'video'
  return 'imagen'
}

export const filaPublicacionIg = (m: MediaIg, ctx: Contexto) => ({
  organizacion_id: ctx.organizacionId,
  cuenta_id: ctx.cuentaId,
  meta_post_id: m.id,
  plataforma: 'instagram' as const,
  tipo: tipoIg(m),
  permalink: m.permalink ?? null,
  texto: m.caption ?? null,
  media_url: m.media_url ?? m.thumbnail_url ?? null,
  publicado_en: m.timestamp,
  crudo: sinPaginado(sinInsights(m)),
})

export const filaPublicacionFb = (p: PostFb, ctx: Contexto) => ({
  organizacion_id: ctx.organizacionId,
  cuenta_id: ctx.cuentaId,
  meta_post_id: p.id,
  plataforma: 'facebook' as const,
  tipo: tipoFb(p),
  permalink: p.permalink_url ?? null,
  texto: p.message ?? null,
  media_url: p.full_picture ?? null,
  publicado_en: p.created_time,
  crudo: sinPaginado(sinInsights(p)),
})

/** La foto es del día argentino en que se capturó (UTC-3). */
const fotoDe = (ahora: Date) => ({
  fecha: rangoDias(ahora, 1).hasta,
  capturado_en: ahora.toISOString(),
})

export const filaMetricaIg = (m: MediaIg, publicacionId: string, ahora: Date) => ({
  publicacion_id: publicacionId,
  ...fotoDe(ahora),
  vistas: insight(m, 'views'),
  alcance: insight(m, 'reach'),
  clics: null,
  impresiones: null,
  me_gusta: insight(m, 'likes'),
  comentarios: insight(m, 'comments'),
  compartidos: insight(m, 'shares'),
  guardados: insight(m, 'saved'),
  crudo: sinPaginado(m.insights ?? {}),
})

export const filaMetricaFb = (p: PostFb, publicacionId: string, ahora: Date) => ({
  publicacion_id: publicacionId,
  ...fotoDe(ahora),
  vistas: insight(p, 'post_media_view'),
  alcance: null,
  clics: insight(p, 'post_clicks'),
  impresiones: null,
  me_gusta: p.reactions?.summary.total_count ?? null,
  comentarios: p.comments?.summary.total_count ?? null,
  compartidos: p.shares?.count ?? 0,
  guardados: null,
  crudo: sinPaginado({
    insights: p.insights ?? null,
    reactions: p.reactions ?? null,
    comments: p.comments ?? null,
    shares: p.shares ?? null,
  }),
})

const DIA_MS = 86_400_000

/**
 * Día argentino al que pertenece un valor diario de insights: Meta informa
 * `end_time` (cierre del período), así que el día es el de un día antes.
 * Aproximación: Meta corta los días en hora del Pacífico, no argentina.
 */
export const diaDeValorDiario = (v: ValorDiario): string | null => {
  const ms = Date.parse(v.end_time)
  return Number.isNaN(ms) ? null : fechaAR(new Date(ms - DIA_MS).toISOString())
}

export type Conteo = { readonly activas: number; readonly mensajes: number }

/**
 * Conversaciones por día argentino de su última actividad (`updated_time`): una
 * conversación cuenta en UN solo día, el de su último movimiento. Cada día de
 * la ventana existe, con 0 si no hubo.
 */
export function conteoPorDia(
  conversaciones: readonly Conversacion[],
  desde: string,
  hasta: string,
): Map<string, Conteo> {
  const dias = new Map(fechasEntre(desde, hasta).map((d) => [d, { activas: 0, mensajes: 0 }]))
  for (const c of conversaciones) {
    const dia = fechaAR(c.updated_time)
    const acumulado = dia ? dias.get(dia) : undefined
    if (!acumulado) continue
    acumulado.activas += 1
    acumulado.mensajes += c.message_count ?? 0
  }
  return dias
}

type ContextoCuenta = { readonly organizacionId: string; readonly cuentaId: string; readonly ahora: Date }

/**
 * Fila de metricas_cuenta de Messenger. `nuevas` es undefined si no se pudo
 * leer el insight: la clave se OMITE para que el upsert no pise con null un
 * valor bueno de una corrida anterior (todas las filas de la tanda comparten claves).
 */
export const filaMensajesFb = (
  fecha: string,
  conteo: Conteo,
  nuevas: ValorDiario | null | undefined,
  ctx: ContextoCuenta,
) => ({
  organizacion_id: ctx.organizacionId,
  cuenta_id: ctx.cuentaId,
  fecha,
  conversaciones_activas: conteo.activas,
  mensajes: conteo.mensajes,
  ...(nuevas === undefined ? {} : { conversaciones_nuevas: nuevas?.value ?? 0 }),
  capturado_en: ctx.ahora.toISOString(),
  crudo: {
    conversaciones: { activas: conteo.activas, mensajes: conteo.mensajes },
    ...(nuevas === undefined ? {} : { insight: nuevas ? { end_time: nuevas.end_time, value: nuevas.value } : null }),
  },
})

/** Instagram: solo conversaciones activas. `mensajes` null: Meta no da message_count; sin métrica de nuevas. */
export const filaMensajesIg = (fecha: string, conteo: Conteo, ctx: ContextoCuenta) => ({
  organizacion_id: ctx.organizacionId,
  cuenta_id: ctx.cuentaId,
  fecha,
  conversaciones_activas: conteo.activas,
  mensajes: null,
  capturado_en: ctx.ahora.toISOString(),
  crudo: { conversaciones: { activas: conteo.activas } },
})
