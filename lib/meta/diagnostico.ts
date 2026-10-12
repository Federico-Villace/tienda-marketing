/**
 * Diagnóstico del token de Meta guardado en Vault.
 *
 * Responde "¿Meta emitió el token sin esos permisos, o el CRM muestra un falso
 * aviso?" con llamadas reales y el MISMO token en todas. Cada paso es
 * independiente: si uno falla se registra el error de Meta (código, subcódigo,
 * mensaje, fbtrace_id) y se sigue con el resto.
 *
 * El informe trae solo metadatos: nunca el token ni el secreto de la app.
 */

import { ErrorMeta, graph, pedir } from './oauth.ts'

type Fetch = typeof fetch

export type ErrorPaso = {
  readonly codigo?: number
  readonly subcodigo?: number
  readonly tipo?: string
  readonly mensaje: string
  readonly fbtrace_id?: string
}

export type Paso = {
  readonly paso: string
  readonly ok: boolean
  readonly datos?: Record<string, unknown>
  readonly error?: ErrorPaso
}

type Entrada = {
  readonly appId: string
  readonly appSecret: string
  readonly version: string
  readonly token: string
  readonly businessId: string
  /** Con prefijo act_. Si falta, se usa la primera que el token declara. */
  readonly adAccountId?: string
}

type DebugToken = {
  data: {
    type?: string
    app_id?: string
    is_valid?: boolean
    expires_at?: number
    data_access_expires_at?: number
    scopes?: string[]
    granular_scopes?: { scope: string; target_ids?: string[] }[]
    error?: { code?: number; subcode?: number; message?: string }
  }
}

const fecha = (segundos?: number) =>
  segundos === undefined ? 'desconocido' : segundos === 0 ? 'nunca' : new Date(segundos * 1000).toISOString()

const conAct = (id: string) => (id.startsWith('act_') ? id : `act_${id}`)

async function correr(
  paso: string,
  fn: () => Promise<Record<string, unknown>>,
): Promise<Paso> {
  try {
    return { paso, ok: true, datos: await fn() }
  } catch (e) {
    if (!(e instanceof ErrorMeta)) {
      return { paso, ok: false, error: { mensaje: e instanceof Error ? e.message : String(e) } }
    }
    return {
      paso,
      ok: false,
      error: {
        codigo: e.codigo,
        subcodigo: e.subcodigo,
        tipo: e.tipo,
        mensaje: e.message,
        fbtrace_id: e.fbtraceId,
      },
    }
  }
}

export async function diagnosticarToken(p: Entrada, f: Fetch): Promise<Paso[]> {
  const leer = <T>(ruta: string, params: Record<string, string> = {}) =>
    pedir<T>(graph(p.version, ruta, { ...params, access_token: p.token }), f)

  const informe: Paso[] = []
  let cuentaDeclarada: string | undefined

  informe.push(
    await correr('debug_token', async () => {
      const { data } = await pedir<DebugToken>(
        graph(p.version, 'debug_token', {
          input_token: p.token,
          access_token: `${p.appId}|${p.appSecret}`,
        }),
        f,
      )
      const granulares = data.granular_scopes ?? []
      cuentaDeclarada = granulares.find((g) => g.scope === 'ads_read')?.target_ids?.[0]
      return {
        tipo: data.type,
        app_id: data.app_id,
        app_coincide: data.app_id === p.appId,
        is_valid: data.is_valid,
        vence: fecha(data.expires_at),
        acceso_a_datos_vence: fecha(data.data_access_expires_at),
        scopes: data.scopes ?? [],
        granular_scopes: granulares.map((g) => ({
          scope: g.scope,
          target_ids: g.target_ids?.length ?? 'todos',
        })),
        ...(data.error ? { error_del_token: data.error } : {}),
      }
    }),
  )

  informe.push(
    await correr('me', async () => {
      const yo = await leer<{ id: string; name?: string }>('me', { fields: 'id,name' })
      return { id: yo.id, nombre: yo.name }
    }),
  )

  informe.push(
    await correr('me/permissions', async () => {
      const { data } = await leer<{ data: { permission: string; status: string }[] }>(
        'me/permissions',
      )
      return {
        otorgados: data.filter((x) => x.status === 'granted').map((x) => x.permission),
        no_otorgados: data
          .filter((x) => x.status !== 'granted')
          .map((x) => `${x.permission}:${x.status}`),
      }
    }),
  )

  informe.push(
    await correr('business', async () => {
      const negocio = await leer<{ id: string; name?: string }>(p.businessId, { fields: 'id,name' })
      return { id: negocio.id, nombre: negocio.name }
    }),
  )

  type Lista = { data: { id: string; name?: string; account_status?: number }[] }
  const listar = (paso: string, ruta: string, fields: string) =>
    correr(paso, async () => {
      const { data } = await leer<Lista>(ruta, { fields, limit: '50' })
      return { cantidad: data.length, items: data }
    })

  informe.push(
    await listar(
      'business/owned_ad_accounts',
      `${p.businessId}/owned_ad_accounts`,
      'id,name,account_status',
    ),
  )
  informe.push(await listar('business/owned_pages', `${p.businessId}/owned_pages`, 'id,name'))
  const misCuentas = await listar('me/adaccounts', 'me/adaccounts', 'id,name,account_status')
  informe.push(misCuentas)

  const primeraMia = (misCuentas.datos?.items as Lista['data'] | undefined)?.[0]?.id
  const cuenta = p.adAccountId ?? cuentaDeclarada ?? primeraMia
  if (cuenta) {
    const act = conAct(cuenta)
    informe.push(
      await correr(`${act}/insights`, async () => {
        const { data } = await leer<{ data: unknown[] }>(`${act}/insights`, {
          date_preset: 'last_30d',
          fields: 'spend,impressions,clicks',
        })
        return { filas: data.length }
      }),
    )
  }

  return informe
}

/** Primeros 12 hex del sha256: sirve para comparar dos tokens sin mostrarlos. */
export async function huella(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 12)
}
