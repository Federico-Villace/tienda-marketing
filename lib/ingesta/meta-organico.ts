/**
 * Lectura orgánica de Meta (Instagram y Facebook) para la ingesta de
 * publicaciones. Los insights van anidados en el listado: sin N+1.
 */

import { graph } from '../meta/oauth.ts'
import { todasLasPaginas, type Esperar } from './meta-ads.ts'

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

/** Con el token del bot. `impressions` no existe en v26: da error 100. */
export const listarMediaIg = (
  m: { version: string; token: string; ig: string; desde: string },
  f: Fetch,
  esperar: Esperar,
) =>
  todasLasPaginas<MediaIg>(
    consulta(m.version, m.token, `${m.ig}/media`, {
      fields:
        'id,caption,media_type,media_product_type,permalink,media_url,thumbnail_url,timestamp,' +
        'insights.metric(views,reach,likes,comments,shares,saved)',
      since: m.desde,
      limit: '50',
    }),
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
      fields:
        'id,message,created_time,permalink_url,full_picture,shares,' +
        'reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),' +
        'attachments{media_type,type},' +
        'insights.metric(post_media_view,post_reactions_by_type_total,post_clicks)',
      since: m.desde,
      limit: '25',
    }),
    f,
    esperar,
  )
