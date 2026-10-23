/**
 * Capa 1 · ingesta orgánica (IG + FB). Un ETL sin IA, hermano del de publicidad.
 *
 *   me/accounts (token del bot) → por cuenta: media de IG | posts de FB
 *   → cuentas_meta, publicaciones, metricas_publicacion → sincronizaciones
 *
 * El token de página sale de me/accounts, vive solo en memoria y es el único
 * que sirve para los posts de FB (regla dura #4). Una cuenta que falla no
 * frena a las demás.
 *
 * Después de los posts, por página, se cuentan los mensajes recibidos (ADR-020):
 * solo conteos por cuenta y día, nunca contenido ni participantes. Si esa parte
 * falla, los posts ya están guardados y la cuenta queda como falla parcial.
 */

import { actualizar, insertar, upsert } from '../supabase/rest.ts'
import type { MediaIg, PostFb } from './meta-organico.ts'
import {
  leerConversacionesNuevas,
  leerMediaIg,
  leerPostsFb,
  listarConversaciones,
  listarPaginas,
  type PaginaMeta,
} from './meta-organico.ts'
import { enParalelo } from './concurrencia.ts'
import { estadoDeCorrida, TOKEN_REF, type Dependencias, type EstadoSync } from './sincronizar.ts'
import { rangoDias } from './transformar.ts'
import {
  conteoPorDia,
  diaDeValorDiario,
  filaMensajesFb,
  filaMensajesIg,
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
  /** Filas de metricas_cuenta (mensajes) escritas; solo en la cuenta de Facebook de cada página. */
  readonly mensajes?: number
  /** La parte de mensajes falló; los posts de esta cuenta se guardaron igual. */
  readonly errorMensajes?: string
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

const DIA_MS = 86_400_000

/**
 * Cuentas (y páginas, en los mensajes) que se procesan a la vez. La corrida en
 * serie tardaba 236 s por 14 cuentas, todo espera de red (ADR-025). Cada página
 * usa su propio page token, y los límites de Meta se cuentan por página/app: 4
 * en vuelo queda lejos de la cuota y baja el total a un cuarto.
 */
export const CONCURRENCIA_ORGANICA = 4

/**
 * Mensajes recibidos de una página: Messenger (activas, mensajes, nuevas) en la
 * cuenta de Facebook e Instagram (activas) en su cuenta. Cada lectura es
 * independiente: lo que anduvo se guarda, lo que falló se informa.
 */
async function sincronizarMensajes(
  d: Dependencias,
  fb: Cuenta,
  ig: Cuenta | undefined,
  ventana: { desde: string; hasta: string },
  tokens: readonly string[],
): Promise<{ filas: number; error?: string }> {
  const { supabase: s, f, esperar } = d
  const pagina = { version: d.meta.version, token: fb.pagina.access_token, pagina: fb.fila.meta_id }
  const errores: string[] = []
  const intentar = async <T>(etiqueta: string, accion: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await accion()
    } catch (e) {
      errores.push(`${etiqueta}: ${textoSeguro(e, tokens)}`)
      return undefined
    }
  }

  const messenger = await intentar('messenger', () =>
    listarConversaciones({ ...pagina, plataforma: 'messenger', desde: ventana.desde }, f, esperar),
  )
  const hastaExclusivo = new Date(Date.parse(`${ventana.hasta}T00:00:00Z`) + DIA_MS).toISOString().slice(0, 10)
  const nuevas = await intentar('nuevas', () =>
    leerConversacionesNuevas({ ...pagina, desde: ventana.desde, hasta: hastaExclusivo }, f, esperar),
  )
  const instagram = ig
    ? await intentar('instagram', () =>
        listarConversaciones({ ...pagina, plataforma: 'instagram', desde: ventana.desde }, f, esperar),
      )
    : undefined

  let filas = 0
  if (messenger) {
    const ctx = { organizacionId: d.organizacionId, cuentaId: fb.fila.id, ahora: d.hoy }
    const nuevasPorDia = nuevas
      ? new Map(
          nuevas.flatMap((v) => {
            const dia = diaDeValorDiario(v)
            return dia ? [[dia, v] as const] : []
          }),
        )
      : undefined
    const guardadas = await intentar('guardar messenger', () =>
      upsert(
        s,
        'metricas_cuenta',
        [...conteoPorDia(messenger, ventana.desde, ventana.hasta)].map(([fecha, conteo]) =>
          filaMensajesFb(fecha, conteo, nuevasPorDia ? (nuevasPorDia.get(fecha) ?? null) : undefined, ctx),
        ),
        'cuenta_id,fecha',
        f,
      ),
    )
    filas += guardadas?.length ?? 0
  }
  if (ig && instagram) {
    const ctx = { organizacionId: d.organizacionId, cuentaId: ig.fila.id, ahora: d.hoy }
    const guardadas = await intentar('guardar instagram', () =>
      upsert(
        s,
        'metricas_cuenta',
        [...conteoPorDia(instagram, ventana.desde, ventana.hasta)].map(([fecha, conteo]) =>
          filaMensajesIg(fecha, conteo, ctx),
        ),
        'cuenta_id,fecha',
        f,
      ),
    )
    filas += guardadas?.length ?? 0
  }
  return { filas, ...(errores.length > 0 ? { error: errores.join(' · ') } : {}) }
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

  const ventana = rangoDias(d.hoy, d.dias ?? 90)
  const { desde } = ventana
  const limite = d.concurrencia ?? CONCURRENCIA_ORGANICA
  // Una cuenta que falla queda como dato en su lugar: no tumba a las que corren a la par.
  const resultados = await enParalelo(cuentas, limite, async (cuenta): Promise<ResultadoCuentaOrganica> => {
    try {
      return await sincronizarCuenta(d, cuenta, desde)
    } catch (e) {
      return {
        cuenta: cuenta.fila.meta_id,
        nombre: cuenta.nombre,
        red: cuenta.fila.tipo,
        publicaciones: 0,
        metricas: 0,
        recuperadas: 0,
        sinMetricas: 0,
        error: textoSeguro(e, tokens),
      }
    }
  })

  // Mensajes: por página, después de los posts. Una falla acá no pisa lo ya guardado.
  const paginasFb = cuentas.filter((c) => c.fila.tipo === 'facebook')
  const mensajesPorPagina = await enParalelo(paginasFb, limite, (fb) => {
    const ig = cuentas.find((c) => c.fila.tipo === 'instagram' && c.pagina.id === fb.fila.meta_id)
    return sincronizarMensajes(d, fb, ig, ventana, tokens)
  })
  paginasFb.forEach((fb, n) => {
    const mensajes = mensajesPorPagina[n]!
    const i = resultados.findIndex((r) => r.red === 'facebook' && r.cuenta === fb.fila.meta_id)
    resultados[i] = {
      ...resultados[i]!,
      mensajes: mensajes.filas,
      ...(mensajes.error ? { errorMensajes: mensajes.error } : {}),
    }
  })

  const errores = resultados.flatMap((r) => [
    ...(r.error ? [`${r.cuenta}: ${r.error}`] : []),
    ...(r.errorMensajes ? [`${r.cuenta}: mensajes: ${r.errorMensajes}`] : []),
  ])
  const estadoPosts = estadoDeCorrida(resultados)
  return cerrar({
    estado: estadoPosts === 'ok' && resultados.some((r) => r.errorMensajes) ? 'parcial' : estadoPosts,
    filas: resultados.reduce((t, r) => t + r.publicaciones + r.metricas, 0),
    cuentas: resultados,
    ...(errores.length > 0 ? { error: errores.join(' · ') } : {}),
  })
}
