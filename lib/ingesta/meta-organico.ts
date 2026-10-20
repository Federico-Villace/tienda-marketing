/**
 * Lectura orgánica de Meta (Instagram y Facebook) para la ingesta de
 * publicaciones. Los insights van anidados en el listado: sin N+1.
 */

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
