/**
 * Capa 1 · ingesta orgánica (IG + FB). Un ETL sin IA, hermano del de publicidad.
 *
 *   me/accounts (token del bot) → por cuenta: media de IG | posts de FB
 *   → cuentas_meta, publicaciones, metricas_publicacion → sincronizaciones
 *
 * El token de página sale de me/accounts, vive solo en memoria y es el único
 * que sirve para los posts de FB (regla dura #4). Una cuenta que falla no
 * frena a las demás.
 */

import { actualizar, insertar, upsert } from '../supabase/rest.ts'
import type { MediaIg, PostFb } from './meta-organico.ts'
import { leerMediaIg, leerPostsFb, listarPaginas, type PaginaMeta } from './meta-organico.ts'
import { estadoDeCorrida, TOKEN_REF, type Dependencias, type EstadoSync } from './sincronizar.ts'
import { rangoDias } from './transformar.ts'
import {
  filaMetricaFb,
  filaMetricaIg,
  filaPublicacionFb,
  filaPublicacionIg,
  textoSeguro,
} from './transformar-organico.ts'

export type ResultadoCuentaOrganica = {
  readonly cuenta: string
  readonly nombre: string
  readonly red: 'facebook' | 'instagram'
  readonly publicaciones: number
  readonly metricas: number
  /** Omitidos por Meta en el listado con insights, recuperados pidiéndolos uno por uno. */
  readonly recuperadas: number
  /** Guardados con métricas en null porque Meta no da insights para ellos (#100). */
  readonly sinMetricas: number
  readonly error?: string
}

export type ResultadoOrganico = {
  readonly estado: EstadoSync
  readonly filas: number
  readonly cuentas: readonly ResultadoCuentaOrganica[]
  readonly error?: string
}

type CuentaBase = { id: string; meta_id: string; tipo: 'facebook' | 'instagram' }
type Cuenta = { fila: CuentaBase; nombre: string; pagina: PaginaMeta }

async function sincronizarCuenta(
  d: Dependencias,
  { fila, nombre, pagina }: Cuenta,
  desde: string,
): Promise<ResultadoCuentaOrganica> {
  const { supabase: s, f, esperar } = d
  const ctx = { organizacionId: d.organizacionId, cuentaId: fila.id }
  const version = d.meta.version

  const lectura =
    fila.tipo === 'instagram'
      ? await leerMediaIg({ version, token: d.meta.token, ig: fila.meta_id, desde }, f, esperar)
      : await leerPostsFb({ version, token: pagina.access_token, pagina: fila.meta_id, desde }, f, esperar)

  const items =
    fila.tipo === 'instagram'
      ? (lectura.items as MediaIg[]).map((m) => ({
          id: m.id,
          publicacion: filaPublicacionIg(m, ctx),
          metrica: (pid: string) => filaMetricaIg(m, pid, d.hoy),
        }))
      : (lectura.items as PostFb[]).map((p) => ({
          id: p.id,
          publicacion: filaPublicacionFb(p, ctx),
          metrica: (pid: string) => filaMetricaFb(p, pid, d.hoy),
        }))

  const guardadas = await upsert<{ id: string; meta_post_id: string }>(
    s,
    'publicaciones',
    items.map((i) => i.publicacion),
    'cuenta_id,meta_post_id',
    f,
  )
  const idEnBase = new Map(guardadas.map((p) => [p.meta_post_id, p.id]))

  const metricas = await upsert(
    s,
    'metricas_publicacion',
    items.flatMap((i) => {
      const pid = idEnBase.get(i.id)
      return pid ? [i.metrica(pid)] : []
    }),
    'publicacion_id,fecha',
    f,
  )

  await actualizar(s, 'cuentas_meta', { id: fila.id }, { ultima_sync: new Date().toISOString() }, f)

  return {
    cuenta: fila.meta_id,
    nombre,
    red: fila.tipo,
    publicaciones: guardadas.length,
    metricas: metricas.length,
    recuperadas: lectura.recuperadas,
    sinMetricas: lectura.sinMetricas,
  }
}

export async function sincronizarOrganico(d: Dependencias): Promise<ResultadoOrganico> {
  const { supabase: s, f } = d
  const corrida = await insertar<{ id: string }>(
    s,
    'sincronizaciones',
    { organizacion_id: d.organizacionId, tipo: 'publicaciones', estado: 'corriendo' },
    f,
  )

  // Todo texto que sale de acá (base, respuesta, consola) pasa por textoSeguro.
  const tokens = [d.meta.token]

  const cerrar = async (r: ResultadoOrganico) => {
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

  let cuentas: Cuenta[]
  try {
    const paginas = await listarPaginas(d.meta, f, d.esperar)
    tokens.push(...paginas.map((p) => p.access_token))

    const filas = paginas.flatMap((p) => [
      { organizacion_id: d.organizacionId, tipo: 'facebook', meta_id: p.id, nombre: p.name, token_ref: TOKEN_REF },
      ...(p.instagram_business_account
        ? [
            {
              organizacion_id: d.organizacionId,
              tipo: 'instagram',
              meta_id: p.instagram_business_account.id,
              nombre: p.instagram_business_account.username ?? p.name,
              token_ref: TOKEN_REF,
            },
          ]
        : []),
    ])
    const guardadas = await upsert<CuentaBase>(s, 'cuentas_meta', filas, 'organizacion_id,tipo,meta_id', f)

    cuentas = guardadas.map((fila) => {
      const pagina = paginas.find((p) => p.id === fila.meta_id || p.instagram_business_account?.id === fila.meta_id)!
      return { fila, pagina, nombre: filas.find((x) => x.tipo === fila.tipo && x.meta_id === fila.meta_id)!.nombre }
    })
  } catch (e) {
    return cerrar({ estado: 'error', filas: 0, cuentas: [], error: textoSeguro(e, tokens) })
  }

  const { desde } = rangoDias(d.hoy, d.dias ?? 90)
  const resultados: ResultadoCuentaOrganica[] = []
  for (const cuenta of cuentas) {
    try {
      resultados.push(await sincronizarCuenta(d, cuenta, desde))
    } catch (e) {
      resultados.push({
        cuenta: cuenta.fila.meta_id,
        nombre: cuenta.nombre,
        red: cuenta.fila.tipo,
        publicaciones: 0,
        metricas: 0,
        recuperadas: 0,
        sinMetricas: 0,
        error: textoSeguro(e, tokens),
      })
    }
  }

  const errores = resultados.filter((r) => r.error).map((r) => `${r.cuenta}: ${r.error}`)
  return cerrar({
    estado: estadoDeCorrida(resultados),
    filas: resultados.reduce((t, r) => t + r.publicaciones + r.metricas, 0),
    cuentas: resultados,
    ...(errores.length > 0 ? { error: errores.join(' · ') } : {}),
  })
}
