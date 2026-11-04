/**
 * Lectura de la Marketing API (Graph) para la ingesta de publicidad (ADR-014).
 *
 * El tier es "Limited access": 60 puntos cada 300 s (ADR-010). Por eso las
 * páginas son grandes (menos llamadas) y ante un corte de cuota se espera cada
 * vez más antes de reintentar, en lugar de insistir en ráfaga.
 */

import { ErrorMeta, graph, pedir } from '../meta/oauth.ts'

type Fetch = typeof fetch
export type Esperar = (ms: number) => Promise<void>

type Meta = { readonly version: string; readonly token: string }

/** Códigos de corte por cuota o throttling de Meta. Cualquier otro error es definitivo. */
const CODIGOS_CUOTA = new Set([4, 17, 32, 613, 80000, 80004])
const ESPERAS_MS = [15_000, 45_000, 90_000]

export async function pedirConReintento<T>(url: URL, f: Fetch, esperar: Esperar): Promise<T> {
  for (let intento = 0; ; intento++) {
    try {
      return await pedir<T>(url, f)
    } catch (e) {
      const esCuota = e instanceof ErrorMeta && e.codigo !== undefined && CODIGOS_CUOTA.has(e.codigo)
      if (!esCuota || intento >= ESPERAS_MS.length) throw e
      await esperar(ESPERAS_MS[intento]!)
    }
  }
}

type Pagina<T> = { data: T[]; paging?: { next?: string } }

export async function todasLasPaginas<T>(url: URL, f: Fetch, esperar: Esperar): Promise<T[]> {
  const datos: T[] = []
  let siguiente: URL | undefined = url
  while (siguiente) {
    const pagina: Pagina<T> = await pedirConReintento<Pagina<T>>(siguiente, f, esperar)
    datos.push(...pagina.data)
    siguiente = pagina.paging?.next ? new URL(pagina.paging.next) : undefined
  }
  return datos
}

export type CuentaPublicitaria = {
  id: string
  name: string
  currency?: string
  timezone_name?: string
  account_status?: number
}

export type CampaniaMeta = {
  id: string
  name: string
  objective?: string
  effective_status?: string
  start_time?: string
  stop_time?: string
}

export type AnuncioMeta = {
  id: string
  name?: string
  campaign_id?: string
  adset_id?: string
  effective_status?: string
  created_time?: string
  updated_time?: string
  creative?: {
    effective_object_story_id?: string
    object_story_id?: string
    effective_instagram_media_id?: string
  }
}

export type Accion = { action_type: string; value: string }

export type InsightDiario = {
  campaign_id: string
  campaign_name?: string
  objective?: string
  date_start: string
  date_stop?: string
  spend?: string
  impressions?: string
  clicks?: string
  ctr?: string
  cpc?: string
  actions?: Accion[]
}

const consulta = (m: Meta, ruta: string, params: Record<string, string>) =>
  graph(m.version, ruta, { ...params, access_token: m.token })

/** me/adaccounts pide solo ads_read: no depende de business_management (ADR-012). */
export const listarCuentasPublicitarias = (m: Meta, f: Fetch, esperar: Esperar) =>
  todasLasPaginas<CuentaPublicitaria>(
    consulta(m, 'me/adaccounts', {
      fields: 'id,name,currency,timezone_name,account_status',
      limit: '100',
    }),
    f,
    esperar,
  )

export const listarCampanias = (m: Meta & { cuenta: string }, f: Fetch, esperar: Esperar) =>
  todasLasPaginas<CampaniaMeta>(
    consulta(m, `${m.cuenta}/campaigns`, {
      fields: 'id,name,objective,effective_status,start_time,stop_time',
      limit: '200',
    }),
    f,
    esperar,
  )

/** Todos los estados: un boost viejo (archivado, pausado) también marca el post como pago. */
const ESTADOS_ANUNCIO = [
  'ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'ARCHIVED', 'DELETED',
  'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW', 'DISAPPROVED', 'PREAPPROVED', 'PENDING_BILLING_INFO',
]

/**
 * Los anuncios de la cuenta, para saber qué publicaciones tienen pauta. Pide el
 * filtro explícito de estados; si Meta lo rechaza (error 100) degrada UNA vez a
 * la consulta sin filtro (que solo trae los no archivados) en vez de perder todo.
 */
export async function listarAnuncios(
  m: Meta & { cuenta: string },
  f: Fetch,
  esperar: Esperar,
): Promise<AnuncioMeta[]> {
  const base = {
    fields:
      'id,name,campaign_id,adset_id,effective_status,created_time,updated_time,creative{effective_object_story_id,object_story_id,effective_instagram_media_id}',
    limit: '500',
  }
  try {
    return await todasLasPaginas<AnuncioMeta>(
      consulta(m, `${m.cuenta}/ads`, { ...base, effective_status: JSON.stringify(ESTADOS_ANUNCIO) }),
      f,
      esperar,
    )
  } catch (e) {
    if (!(e instanceof ErrorMeta) || e.codigo !== 100) throw e
    return todasLasPaginas<AnuncioMeta>(consulta(m, `${m.cuenta}/ads`, base), f, esperar)
  }
}

export const insightsDiarios = (
  m: Meta & { cuenta: string; desde: string; hasta: string },
  f: Fetch,
  esperar: Esperar,
) =>
  todasLasPaginas<InsightDiario>(
    consulta(m, `${m.cuenta}/insights`, {
      level: 'campaign',
      time_increment: '1',
      time_range: JSON.stringify({ since: m.desde, until: m.hasta }),
      fields: 'campaign_id,campaign_name,objective,spend,impressions,clicks,ctr,cpc,actions',
      limit: '500',
    }),
    f,
    esperar,
  )
