/**
 * Capa 1 · ingesta de publicidad. Un ETL sin IA.
 *
 *   Vault (token) → me/adaccounts → por cuenta: campañas + insights diarios
 *   → cuentas_meta, campanias, metricas_campania → registro en sincronizaciones
 *
 * Una cuenta que falla no frena a las demás: queda anotada en el error de la
 * corrida y lo que sí se pudo leer se guarda igual.
 */

import { describirError, ErrorMeta } from '../meta/oauth.ts'
import { NOMBRE_SECRETO_META } from '../meta/boveda.ts'
import { actualizar, insertar, upsert, type Supabase } from '../supabase/rest.ts'
import {
  insightsDiarios,
  listarCampanias,
  listarCuentasPublicitarias,
  type CampaniaMeta,
  type Esperar,
} from './meta-ads.ts'
import { filaCampania, filaMetrica, rangoDias } from './transformar.ts'

type Fetch = typeof fetch

export type Dependencias = {
  readonly meta: { readonly version: string; readonly token: string }
  readonly supabase: Supabase
  readonly organizacionId: string
  readonly hoy: Date
  readonly dias?: number
  readonly f: Fetch
  readonly esperar: Esperar
}

export type ResultadoCuenta = {
  readonly cuenta: string
  readonly nombre: string
  readonly campanias: number
  readonly metricas: number
  readonly error?: string
}

export type ResultadoSync = {
  readonly estado: 'ok' | 'error'
  readonly filas: number
  readonly cuentas: readonly ResultadoCuenta[]
  readonly error?: string
}

const textoError = (e: unknown) =>
  e instanceof ErrorMeta ? describirError(e) : e instanceof Error ? e.message : String(e)

export const TOKEN_REF = `vault:${NOMBRE_SECRETO_META}`

async function sincronizarCuenta(
  d: Dependencias,
  cuenta: { id: string; name: string },
  rango: { desde: string; hasta: string },
): Promise<ResultadoCuenta> {
  const { supabase: s, f, esperar } = d
  const m = { ...d.meta, cuenta: cuenta.id }

  const [registro] = await upsert<{ id: string }>(
    s,
    'cuentas_meta',
    [
      {
        organizacion_id: d.organizacionId,
        tipo: 'ad_account',
        meta_id: cuenta.id,
        nombre: cuenta.name,
        token_ref: TOKEN_REF,
      },
    ],
    'organizacion_id,tipo,meta_id',
    f,
  )
  const cuentaId = registro!.id

  const campanias = await listarCampanias(m, f, esperar)
  const insights = await insightsDiarios({ ...m, ...rango }, f, esperar)

  // Solo lo que importa para el período: activas o con datos. El histórico de
  // cientos de campañas pausadas no aporta y gasta filas.
  const conDatos = new Set(insights.map((i) => i.campaign_id))
  const porId = new Map<string, CampaniaMeta>(
    campanias
      .filter((c) => c.effective_status === 'ACTIVE' || conDatos.has(c.id))
      .map((c) => [c.id, c]),
  )
  for (const i of insights) {
    if (!porId.has(i.campaign_id)) {
      porId.set(i.campaign_id, {
        id: i.campaign_id,
        name: i.campaign_name ?? i.campaign_id,
        objective: i.objective,
      })
    }
  }

  const guardadas = await upsert<{ id: string; meta_campaign_id: string }>(
    s,
    'campanias',
    [...porId.values()].map((c) => filaCampania(c, { organizacionId: d.organizacionId, cuentaId })),
    'cuenta_id,meta_campaign_id',
    f,
  )
  const idEnBase = new Map(guardadas.map((c) => [c.meta_campaign_id, c.id]))

  const metricas = await upsert(
    s,
    'metricas_campania',
    insights.map((i) => filaMetrica(i, idEnBase.get(i.campaign_id)!)),
    'campania_id,fecha',
    f,
  )

  await actualizar(s, 'cuentas_meta', { id: cuentaId }, { ultima_sync: new Date().toISOString() }, f)

  return { cuenta: cuenta.id, nombre: cuenta.name, campanias: guardadas.length, metricas: metricas.length }
}

export async function sincronizarPublicidad(d: Dependencias): Promise<ResultadoSync> {
  const { supabase: s, f } = d
  const corrida = await insertar<{ id: string }>(
    s,
    'sincronizaciones',
    { organizacion_id: d.organizacionId, tipo: 'campanias', estado: 'corriendo' },
    f,
  )

  const cerrar = async (r: ResultadoSync) => {
    await actualizar(
      s,
      'sincronizaciones',
      { id: corrida.id },
      {
        estado: r.estado,
        terminada_en: new Date().toISOString(),
        filas_afectadas: r.filas,
        error: r.error ?? null,
      },
      f,
    )
    return r
  }

  let cuentas
  try {
    cuentas = await listarCuentasPublicitarias(d.meta, f, d.esperar)
  } catch (e) {
    return cerrar({ estado: 'error', filas: 0, cuentas: [], error: textoError(e) })
  }

  const rango = rangoDias(d.hoy, d.dias ?? 90)
  const resultados: ResultadoCuenta[] = []
  for (const cuenta of cuentas) {
    try {
      resultados.push(await sincronizarCuenta(d, cuenta, rango))
    } catch (e) {
      resultados.push({ cuenta: cuenta.id, nombre: cuenta.name, campanias: 0, metricas: 0, error: textoError(e) })
    }
  }

  const errores = resultados.filter((r) => r.error).map((r) => `${r.cuenta}: ${r.error}`)
  return cerrar({
    estado: errores.length > 0 ? 'error' : 'ok',
    filas: resultados.reduce((t, r) => t + r.campanias + r.metricas, 0),
    cuentas: resultados,
    ...(errores.length > 0 ? { error: errores.join(' · ') } : {}),
  })
}
