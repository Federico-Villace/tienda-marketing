/**
 * Lectura orgánica de Meta (Instagram y Facebook) para la ingesta de
 * publicaciones. Los insights van anidados en el listado: sin N+1.
 */

import { ErrorMeta, graph } from '../meta/oauth.ts'
import { pedirConReintento, todasLasPaginas, type Esperar } from './meta-ads.ts'
import { inicioDiaAR } from './transformar.ts'

type Fetch = typeof fetch

type Insight = { name: string; values: { value: number | Record<string, number> }[] }
type ConInsights = { insights?: { data: Insight[] } }

export type PaginaMeta = {
  id: string
  name: string
  access_token: string
  instagram_business_account?: { id: string; username?: string }
}

export type MediaIg = ConInsights & {
  id: string
  caption?: string
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'
  media_product_type?: 'FEED' | 'REELS' | 'STORY'
  permalink?: string
  media_url?: string
  thumbnail_url?: string
  timestamp: string
}

export type PostFb = ConInsights & {
  id: string
  message?: string
  created_time: string
  permalink_url?: string
  full_picture?: string
  shares?: { count: number }
  reactions?: { summary: { total_count: number } }
  comments?: { summary: { total_count: number } }
  attachments?: { data: { media_type?: string; type?: string }[] }
}

const consulta = (version: string, token: string, ruta: string, params: Record<string, string>) =>
  graph(version, ruta, { ...params, access_token: token })

/** me/accounts con el token del bot: trae cada página con su IG y su page token. */
export const listarPaginas = (m: { version: string; token: string }, f: Fetch, esperar: Esperar) =>
  todasLasPaginas<PaginaMeta>(
    consulta(m.version, m.token, 'me/accounts', {
      fields: 'id,name,access_token,instagram_business_account{id,username}',
      limit: '100',
    }),
    f,
    esperar,
  )

const CAMPOS_MEDIA_IG =
  'id,caption,media_type,media_product_type,permalink,media_url,thumbnail_url,timestamp'
const METRICAS_IG = 'views,reach,likes,comments,shares,saved'

const CAMPOS_POST_FB =
  'id,message,created_time,permalink_url,full_picture,shares,' +
  'reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),' +
  'attachments{media_type,type}'
const METRICAS_FB = 'post_media_view,post_reactions_by_type_total,post_clicks'

/**
 * Con el token del bot. `impressions` no existe en v26: da error 100.
 * Con `insights` anidados Meta OMITE, sin error, los media que no puede medir
 * (sondeo 20-oct): el listado completo es `listarMediaIgSinInsights`.
 */
export const listarMediaIg = (
  m: { version: string; token: string; ig: string; desde: string },
  f: Fetch,
  esperar: Esperar,
) =>
  todasLasPaginas<MediaIg>(
    consulta(m.version, m.token, `${m.ig}/media`, {
      fields: `${CAMPOS_MEDIA_IG},insights.metric(${METRICAS_IG})`,
      since: m.desde,
      limit: '50',
    }),
    f,
    esperar,
  )

/** El listado autoritativo: sin insights anidados, Meta no omite nada. */
export const listarMediaIgSinInsights = (
  m: { version: string; token: string; ig: string; desde: string },
  f: Fetch,
  esperar: Esperar,
) =>
  todasLasPaginas<MediaIg>(
    consulta(m.version, m.token, `${m.ig}/media`, { fields: CAMPOS_MEDIA_IG, since: m.desde, limit: '50' }),
    f,
    esperar,
  )

/** Exige el page token (el del bot da error 190/2069032). `token` es ese token, solo en memoria. */
export const listarPostsFb = (
  m: { version: string; token: string; pagina: string; desde: string },
  f: Fetch,
  esperar: Esperar,
) =>
  todasLasPaginas<PostFb>(
    consulta(m.version, m.token, `${m.pagina}/posts`, {
      fields: `${CAMPOS_POST_FB},insights.metric(${METRICAS_FB})`,
      since: m.desde,
      limit: '25',
    }),
    f,
    esperar,
  )

export const listarPostsFbSinInsights = (
  m: { version: string; token: string; pagina: string; desde: string },
  f: Fetch,
  esperar: Esperar,
) =>
  todasLasPaginas<PostFb>(
    consulta(m.version, m.token, `${m.pagina}/posts`, { fields: CAMPOS_POST_FB, since: m.desde, limit: '25' }),
    f,
    esperar,
  )

/** Insights de un solo media/post. `null` si Meta responde #100 (no los soporta). */
async function insightsIndividuales(
  m: { version: string; token: string; id: string; metricas: string },
  f: Fetch,
  esperar: Esperar,
): Promise<Insight[] | null> {
  try {
    return await todasLasPaginas<Insight>(
      consulta(m.version, m.token, `${m.id}/insights`, { metric: m.metricas }),
      f,
      esperar,
    )
  } catch (e) {
    if (e instanceof ErrorMeta && e.codigo === 100) return null
    throw e
  }
}

export type Lectura<T> = {
  readonly items: T[]
  /** Omitidos del listado anidado cuyos insights se pidieron uno por uno y llegaron. */
  readonly recuperadas: number
  /** Omitidos para los que Meta no da insights (#100): se guardan con métricas en null. */
  readonly sinMetricas: number
}

/**
 * Meta omite en silencio los items sin insights. Se lista sin insights (manda),
 * se lista con insights, se cruza por id y solo los que faltan se piden de a uno.
 */
async function completar<T extends ConInsights & { id: string }>(
  base: T[],
  anidados: T[],
  pedirUno: (id: string) => Promise<Insight[] | null>,
): Promise<Lectura<T>> {
  const conInsights = new Map(anidados.map((x) => [x.id, x.insights]))
  let recuperadas = 0
  let sinMetricas = 0
  const items: T[] = []
  for (const x of base) {
    if (conInsights.has(x.id)) {
      const insights = conInsights.get(x.id)
      items.push(insights ? { ...x, insights } : x)
      continue
    }
    const data = await pedirUno(x.id)
    if (data) {
      recuperadas++
      items.push({ ...x, insights: { data } })
    } else {
      sinMetricas++
      items.push(x)
    }
  }
  return { items, recuperadas, sinMetricas }
}

export async function leerMediaIg(
  m: { version: string; token: string; ig: string; desde: string },
  f: Fetch,
  esperar: Esperar,
): Promise<Lectura<MediaIg>> {
  const base = await listarMediaIgSinInsights(m, f, esperar)
  const anidados = await listarMediaIg(m, f, esperar)
  return completar(base, anidados, (id) =>
    insightsIndividuales({ version: m.version, token: m.token, id, metricas: METRICAS_IG }, f, esperar),
  )
}

export async function leerPostsFb(
  m: { version: string; token: string; pagina: string; desde: string },
  f: Fetch,
  esperar: Esperar,
): Promise<Lectura<PostFb>> {
  const base = await listarPostsFbSinInsights(m, f, esperar)
  const anidados = await listarPostsFb(m, f, esperar)
  return completar(base, anidados, (id) =>
    insightsIndividuales({ version: m.version, token: m.token, id, metricas: METRICAS_FB }, f, esperar),
  )
}

/**
 * Una conversación reducida a lo único que se guarda. Meta devuelve además el
 * id y los participantes aunque no se pidan: `listarConversaciones` los tira en
 * la lectura, para que no puedan llegar a ninguna escritura ni log (ADR-020).
 */
export type Conversacion = { readonly updated_time: string; readonly message_count: number | null }

export const MAX_PAGINAS_CONVERSACIONES = 50

/**
 * Conversaciones de la página, de la más reciente a la más vieja, hasta salir de
 * la ventana (`desde`, YYYY-MM-DD hora AR). `plataforma` messenger da
 * message_count; instagram lo manda en 0/ausente (sondeo 20-oct), no se usa.
 * Si llega al tope de páginas sin salir de la ventana, falla: un conteo
 * truncado sería un número equivocado presentado como verdadero.
 */
export async function listarConversaciones(
  m: { version: string; token: string; pagina: string; plataforma: 'messenger' | 'instagram'; desde: string },
  f: Fetch,
  esperar: Esperar,
  maxPaginas = MAX_PAGINAS_CONVERSACIONES,
): Promise<Conversacion[]> {
  const inicio = inicioDiaAR(m.desde)
  const conversaciones: Conversacion[] = []
  let siguiente: URL | undefined = consulta(m.version, m.token, `${m.pagina}/conversations`, {
    platform: m.plataforma,
    fields: 'updated_time,message_count',
    limit: '100',
  })
  for (let n = 0; siguiente; n++) {
    if (n >= maxPaginas) {
      throw new Error(`Tope de ${maxPaginas} páginas de conversaciones alcanzado sin llegar al inicio de la ventana`)
    }
    const pagina: { data: { updated_time: string; message_count?: number }[]; paging?: { next?: string } } =
      await pedirConReintento(siguiente, f, esperar)
    conversaciones.push(
      ...pagina.data.map((c) => ({ updated_time: c.updated_time, message_count: c.message_count ?? null })),
    )
    const ultima = pagina.data.at(-1)
    if (!ultima || Date.parse(ultima.updated_time) < inicio) break
    siguiente = pagina.paging?.next ? new URL(pagina.paging.next) : undefined
  }
  return conversaciones
}

export const METRICA_CONVERSACIONES_NUEVAS = 'page_messages_new_conversations_unique'

export type ValorDiario = { readonly end_time: string; readonly value: number }

/**
 * Conversaciones nuevas por día de la página (insight de página, page token).
 * Una sola llamada, sin seguir paging: con since/until el `next` de insights
 * avanza en el tiempo sin fin. 90 días entran en el máximo de 93 de Meta.
 */
export async function leerConversacionesNuevas(
  m: { version: string; token: string; pagina: string; desde: string; hasta: string },
  f: Fetch,
  esperar: Esperar,
): Promise<ValorDiario[]> {
  const respuesta = await pedirConReintento<{ data: { name: string; values: { end_time?: string; value?: unknown }[] }[] }>(
    consulta(m.version, m.token, `${m.pagina}/insights`, {
      metric: METRICA_CONVERSACIONES_NUEVAS,
      period: 'day',
      since: m.desde,
      until: m.hasta,
    }),
    f,
    esperar,
  )
  return respuesta.data
    .filter((i) => i.name === METRICA_CONVERSACIONES_NUEVAS)
    .flatMap((i) => i.values)
    .flatMap((v) =>
      typeof v.end_time === 'string' && typeof v.value === 'number' ? [{ end_time: v.end_time, value: v.value }] : [],
    )
}
