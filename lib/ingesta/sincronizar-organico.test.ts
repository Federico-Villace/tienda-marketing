import { describe, it, expect, vi, afterEach } from 'vitest'
import { sincronizarOrganico } from './sincronizar-organico'

const SUPA = 'https://abc.supabase.co'
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })

const paginas = (n: number, conIg = true) =>
  Array.from({ length: n }, (_, i) => ({
    id: `page-${i + 1}`,
    name: `Marca ${i + 1}`,
    access_token: `PT-secreto-${i + 1}`,
    ...(conIg ? { instagram_business_account: { id: `ig-${i + 1}`, username: `marca${i + 1}` } } : {}),
  }))

type Opciones = {
  paginas?: unknown[]
  falla?: Record<string, unknown>
  /** Se agrega al paging del primer media IG, como hace Meta. */
  pagingConToken?: boolean
  /** Cuántos media/posts devuelve cada cuenta (por defecto 1). */
  porCuenta?: number
  /** Ids que Meta omite en el listado con insights anidados, sin error (sondeo del 20-oct). */
  omitidos?: string[]
  /** Respuesta de `/{id}/insights` por id; sin entrada, la llamada es inesperada. */
  individual?: Record<string, unknown>
  /** Conversaciones por `${pagina}:${plataforma}`, más recientes primero, como las lista Meta. */
  conversaciones?: Record<string, { updated_time: string; message_count?: number }[]>
  /** Cuántas conversaciones entran por página de la respuesta (Meta pagina de a `limit`). */
  tamPagina?: number
  /** Plataformas de conversations que responden sin permiso. */
  sinPermiso?: string[]
  /** Valores diarios de page_messages_new_conversations_unique por página. */
  nuevas?: Record<string, { end_time: string; value: number }[]>
}

const METRICA_NUEVAS = 'page_messages_new_conversations_unique'

/**
 * Meta y Supabase falsos. Supabase respeta `on_conflict`: re-escribir la misma
 * clave pisa la fila en lugar de duplicarla, como Postgres.
 */
function mundo({
  paginas: ps = paginas(2),
  falla = {},
  pagingConToken = false,
  porCuenta = 1,
  omitidos = [],
  individual = {},
  conversaciones = {},
  tamPagina = 100,
  sinPermiso = [],
  nuevas = {},
}: Opciones = {}) {
  const tablas: Record<string, Map<string, any>> = {}
  const payloads: unknown[] = []
  const cambios: { tabla: string; cuerpo: any }[] = []
  const llamadas: URL[] = []

  const f = vi.fn<typeof fetch>(async (entrada, init) => {
    const url = new URL(String(entrada))
    if (url.origin === SUPA) {
      const tabla = url.pathname.replace('/rest/v1/', '')
      const cuerpo = init?.body ? JSON.parse(String(init.body)) : undefined
      payloads.push(cuerpo)
      if (init?.method === 'PATCH') {
        cambios.push({ tabla, cuerpo })
        return new Response(null, { status: 204 })
      }
      const filas = Array.isArray(cuerpo) ? cuerpo : [cuerpo]
      const columnas = url.searchParams.get('on_conflict')?.split(',')
      const t = (tablas[tabla] ??= new Map())
      const devueltas = filas.map((x: any) => {
        const clave = columnas ? columnas.map((c) => x[c]).join('|') : `${t.size}`
        const previa = t.get(clave)
        const fila = { ...previa, ...x, id: previa?.id ?? `${tabla}:${clave}` }
        t.set(clave, fila)
        return fila
      })
      return json(devueltas, 201)
    }

    llamadas.push(url)
    const ruta = url.pathname.replace('/v26.0/', '')
    const clave = Object.keys(falla).find((k) => ruta.startsWith(k))
    if (clave) return json(falla[clave], 400)
    if (ruta === 'me/accounts') return json({ data: ps })
    if (ruta.endsWith('/conversations')) {
      const pagina = ruta.split('/')[0]!
      const plataforma = url.searchParams.get('platform')!
      if (sinPermiso.includes(plataforma)) return json({ error: { message: 'Permission denied', code: 10 } }, 400)
      const todas = conversaciones[`${pagina}:${plataforma}`] ?? []
      const desde = Number(url.searchParams.get('offset') ?? 0)
      const tam = Math.min(Number(url.searchParams.get('limit')), tamPagina)
      // Meta devuelve el id, los participantes y el snippet aunque no se pidan: nada de eso puede persistirse.
      const data = todas.slice(desde, desde + tam).map((c, i) => ({
        id: `t_CONV_SECRETA_${desde + i}`,
        participants: { data: [{ name: 'Cliente Secreto', id: 'PSID_SECRETO' }] },
        snippet: 'hola, cuánto sale la moto SECRETA',
        ...c,
      }))
      const siguiente = desde + tam < todas.length
      return json({
        data,
        ...(siguiente
          ? {
              paging: {
                next: `https://graph.facebook.com/v26.0/${ruta}?platform=${plataforma}&limit=100&offset=${desde + tam}&access_token=${url.searchParams.get('access_token')}`,
              },
            }
          : {}),
      })
    }
    if (ruta.endsWith('/insights') && url.searchParams.get('metric') === METRICA_NUEVAS) {
      const pagina = ruta.split('/')[0]!
      return json({ data: [{ name: METRICA_NUEVAS, period: 'day', values: nuevas[pagina] ?? [] }] })
    }
    if (ruta.endsWith('/insights')) {
      const id = ruta.split('/')[0]!
      if (!(id in individual)) throw new Error(`Insights individuales inesperados: ${url}`)
      return json(individual[id])
    }
    const anidados = url.searchParams.get('fields')?.includes('insights.metric') ?? false
    const sinOmitidos = <T extends { id: string }>(xs: T[]) => (anidados ? xs.filter((x) => !omitidos.includes(x.id)) : xs)
    if (ruta.endsWith('/media')) {
      const ig = ruta.split('/')[0]!
      const media = Array.from({ length: porCuenta }, (_, i) => ({
        id: `${ig}-m${i + 1}`,
        media_type: 'IMAGE',
        media_product_type: 'FEED',
        timestamp: '2026-10-01T15:00:00+0000',
        ...(anidados
          ? {
              insights: {
                data: [{ name: 'views', values: [{ value: 10 }] }],
                ...(pagingConToken ? { paging: { next: 'https://g/x?access_token=PT-secreto-1' } } : {}),
              },
            }
          : {}),
      }))
      return json({ data: sinOmitidos(media) })
    }
    if (ruta.endsWith('/posts')) {
      const pagina = ruta.split('/')[0]!
      const posts = Array.from({ length: porCuenta }, (_, i) => ({
        id: `${pagina}_p${i + 1}`,
        created_time: '2026-10-02T12:00:00+0000',
        reactions: { summary: { total_count: 3 } },
        ...(anidados ? { insights: { data: [{ name: 'post_media_view', values: [{ value: 50 }] }] } } : {}),
      }))
      return json({ data: sinOmitidos(posts) })
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, tablas, payloads, cambios, llamadas, filas: (t: string) => [...(tablas[t]?.values() ?? [])] }
}

const base = (f: typeof fetch, hoy = '2026-10-20T15:00:00Z') => ({
  meta: { version: 'v26.0', token: 'BOT-secreto' },
  supabase: { url: SUPA, secretKey: 'sb_secret_xyz' },
  organizacionId: 'org-1',
  hoy: new Date(hoy),
  f,
  esperar: async () => {},
})

afterEach(() => vi.restoreAllMocks())

describe('alta de cuentas (R1)', () => {
  it('da de alta una cuenta facebook y una instagram por página, con el NOMBRE del secreto del bot', async () => {
    const m = mundo({ paginas: paginas(7) })
    await sincronizarOrganico(base(m.f))
    const cuentas = m.filas('cuentas_meta')
    expect(cuentas).toHaveLength(14)
    expect(cuentas.filter((c) => c.tipo === 'facebook')).toHaveLength(7)
    expect(cuentas.filter((c) => c.tipo === 'instagram')).toHaveLength(7)
    expect(cuentas.every((c) => c.token_ref === 'vault:meta_access_token')).toBe(true)
    expect(cuentas.find((c) => c.tipo === 'instagram')).toMatchObject({ meta_id: 'ig-1', nombre: 'marca1' })
  })

  it('re-correr no duplica nada', async () => {
    const m = mundo()
    await sincronizarOrganico(base(m.f))
    await sincronizarOrganico(base(m.f))
    expect(m.filas('cuentas_meta')).toHaveLength(4)
    expect(m.filas('publicaciones')).toHaveLength(4)
  })

  it('una página sin IG solo da de alta la de facebook', async () => {
    const m = mundo({ paginas: paginas(1, false) })
    await sincronizarOrganico(base(m.f))
    expect(m.filas('cuentas_meta').map((c) => c.tipo)).toEqual(['facebook'])
  })
})

describe('idempotencia diaria (R6)', () => {
  it('dos corridas el mismo día dejan una métrica por post', async () => {
    const m = mundo()
    await sincronizarOrganico(base(m.f, '2026-10-20T10:00:00Z'))
    await sincronizarOrganico(base(m.f, '2026-10-20T18:00:00Z'))
    expect(m.filas('metricas_publicacion')).toHaveLength(4)
  })

  it('un día distinto agrega una fila nueva por post', async () => {
    const m = mundo()
    await sincronizarOrganico(base(m.f, '2026-10-20T10:00:00Z'))
    await sincronizarOrganico(base(m.f, '2026-10-21T10:00:00Z'))
    expect(m.filas('metricas_publicacion')).toHaveLength(8)
    expect(m.filas('metricas_publicacion').map((x) => x.fecha)).toContain('2026-10-21')
  })

  it('pide los últimos 90 días', async () => {
    const m = mundo()
    await sincronizarOrganico(base(m.f))
    const media = m.llamadas.find((u) => u.pathname.endsWith('/media'))!
    expect(media.searchParams.get('since')).toBe('2026-07-23')
  })
})

describe('aislamiento de fallas (R7)', () => {
  it('si una cuenta falla, las otras se ingestan y se informa el error', async () => {
    const m = mundo({
      falla: { 'page-2/posts': { error: { message: 'Missing Permissions', code: 200 } } },
    })
    const r = await sincronizarOrganico(base(m.f))
    expect(r.estado).toBe('parcial')
    expect(m.cambios.find((c) => c.tabla === 'sincronizaciones')!.cuerpo.estado).toBe('parcial')
    expect(r.cuentas).toHaveLength(4)
    expect(r.cuentas.filter((c) => c.error)).toHaveLength(1)
    expect(m.filas('publicaciones')).toHaveLength(3)
    expect(r.error).toContain('page-2: (#200) Missing Permissions')
  })
})

describe('estado de la corrida cuando fallan todas las cuentas', () => {
  it('queda en error, no en parcial', async () => {
    const m = mundo({
      falla: {
        'page-1/posts': { error: { message: 'Missing Permissions', code: 200 } },
        'page-2/posts': { error: { message: 'Missing Permissions', code: 200 } },
        'ig-1/media': { error: { message: 'Missing Permissions', code: 200 } },
        'ig-2/media': { error: { message: 'Missing Permissions', code: 200 } },
      },
    })
    const r = await sincronizarOrganico(base(m.f))
    expect(r.cuentas.every((c) => c.error)).toBe(true)
    expect(r.estado).toBe('error')
  })
})

describe('registro en sincronizaciones (R8)', () => {
  it("abre tipo 'publicaciones' y cierra en ok con las filas escritas", async () => {
    const m = mundo()
    const r = await sincronizarOrganico(base(m.f))
    expect(m.filas('sincronizaciones')[0]).toMatchObject({ tipo: 'publicaciones', estado: 'corriendo' })
    const cierre = m.cambios.find((c) => c.tabla === 'sincronizaciones')!.cuerpo
    expect(cierre).toMatchObject({ estado: 'ok', filas_afectadas: 8, error: null })
    expect(r).toMatchObject({ estado: 'ok', filas: 8 })
  })

  it('si no puede listar las páginas, cierra en error', async () => {
    const m = mundo({ falla: { 'me/accounts': { error: { message: 'Invalid OAuth access token', code: 190 } } } })
    const r = await sincronizarOrganico(base(m.f))
    expect(r.estado).toBe('error')
    expect(m.cambios.find((c) => c.tabla === 'sincronizaciones')!.cuerpo).toMatchObject({
      estado: 'error',
      error: '(#190) Invalid OAuth access token',
    })
  })

  it('actualiza ultima_sync de las cuentas que anduvieron', async () => {
    const m = mundo()
    await sincronizarOrganico(base(m.f))
    expect(m.cambios.filter((c) => c.tabla === 'cuentas_meta' && c.cuerpo.ultima_sync)).toHaveLength(4)
  })
})

describe('secreto de los tokens (R9)', () => {
  it('ni los page tokens ni el del bot llegan a la base, al resultado o a la consola', async () => {
    const consola = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
    ]
    const m = mundo({ pagingConToken: true })
    const r = await sincronizarOrganico(base(m.f))
    const todo = JSON.stringify([m.payloads, m.cambios, r, consola.map((c) => c.mock.calls)])
    expect(todo).not.toContain('PT-secreto')
    expect(todo).not.toContain('BOT-secreto')
    expect(todo).not.toContain('paging')
  })

  it('un error de Meta con el token en el mensaje se persiste redactado', async () => {
    const m = mundo({
      falla: {
        'page-1/posts': { error: { message: 'Invalid token PT-secreto-1 en ?access_token=PT-secreto-1', code: 190 } },
      },
    })
    const r = await sincronizarOrganico(base(m.f))
    const todo = JSON.stringify([m.payloads, m.cambios, r])
    expect(todo).not.toContain('PT-secreto-1')
    expect(r.error).toContain('***')
  })
})

describe('media que Meta omite del listado con insights (corrección 20-oct)', () => {
  const unaIg = { paginas: paginas(1) }
  const insightsIg = (vistas: number) => ({
    data: [
      { name: 'views', period: 'lifetime', values: [{ value: vistas }] },
      { name: 'reach', period: 'lifetime', values: [{ value: 4 }] },
    ],
  })
  const insightsFb = { data: [{ name: 'post_media_view', values: [{ value: 77 }] }] }
  const e100 = { error: { message: 'The media does not support this metric', code: 100 } }

  it('el sondeo: 17 listados, 16 con insights, uno IMAGE/FEED omitido: los 17 quedan en publicaciones', async () => {
    const m = mundo({ ...unaIg, porCuenta: 17, omitidos: ['ig-1-m9'], individual: { 'ig-1-m9': insightsIg(33) } })
    const r = await sincronizarOrganico(base(m.f))
    const ig = m.filas('publicaciones').filter((p) => p.plataforma === 'instagram')
    expect(ig).toHaveLength(17)
    expect(ig.map((p) => p.meta_post_id)).toContain('ig-1-m9')
    expect(r.cuentas.find((c) => c.red === 'instagram')).toMatchObject({ publicaciones: 17, metricas: 17 })
  })

  it('pide los insights uno por uno solo de los que faltan, con el token del bot y las métricas del listado', async () => {
    const m = mundo({ ...unaIg, porCuenta: 17, omitidos: ['ig-1-m9'], individual: { 'ig-1-m9': insightsIg(33) } })
    await sincronizarOrganico(base(m.f))
    const indiv = m.llamadas.filter((u) => u.pathname.endsWith('/insights') && u.searchParams.get('metric') !== METRICA_NUEVAS)
    expect(indiv).toHaveLength(1)
    expect(indiv[0]!.pathname).toBe('/v26.0/ig-1-m9/insights')
    expect(indiv[0]!.searchParams.get('metric')).toBe('views,reach,likes,comments,shares,saved')
    expect(indiv[0]!.searchParams.get('access_token')).toBe('BOT-secreto')
  })

  it('si ninguno falta, no hace ninguna llamada individual', async () => {
    const m = mundo({ ...unaIg, porCuenta: 3 })
    await sincronizarOrganico(base(m.f))
    expect(m.llamadas.filter((u) => u.pathname.endsWith('/insights') && u.searchParams.get('metric') !== METRICA_NUEVAS)).toHaveLength(0)
  })

  it('el recuperado guarda sus métricas reales y se informa cuántos fueron', async () => {
    const m = mundo({ ...unaIg, porCuenta: 2, omitidos: ['ig-1-m2'], individual: { 'ig-1-m2': insightsIg(33) } })
    const r = await sincronizarOrganico(base(m.f))
    const pubId = m.filas('publicaciones').find((p) => p.meta_post_id === 'ig-1-m2')!.id
    expect(m.filas('metricas_publicacion').find((x) => x.publicacion_id === pubId)).toMatchObject({
      vistas: 33,
      alcance: 4,
    })
    expect(r.cuentas.find((c) => c.red === 'instagram')).toMatchObject({ recuperadas: 1, sinMetricas: 0 })
  })

  it('con error #100 en los insights individuales guarda la publicación y su fila de métricas en null', async () => {
    const m = mundo({ ...unaIg, porCuenta: 2, omitidos: ['ig-1-m2'], falla: { 'ig-1-m2/insights': e100 } })
    const r = await sincronizarOrganico(base(m.f))
    expect(r.estado).toBe('ok')
    const pubId = m.filas('publicaciones').find((p) => p.meta_post_id === 'ig-1-m2')!.id
    expect(m.filas('metricas_publicacion').find((x) => x.publicacion_id === pubId)).toMatchObject({
      vistas: null,
      alcance: null,
      me_gusta: null,
    })
    expect(r.cuentas.find((c) => c.red === 'instagram')).toMatchObject({
      publicaciones: 2,
      recuperadas: 0,
      sinMetricas: 1,
    })
  })

  it('cualquier otro error de los insights individuales es error de la cuenta, con el token redactado', async () => {
    const m = mundo({
      ...unaIg,
      omitidos: ['ig-1-m1'],
      falla: { 'ig-1-m1/insights': { error: { message: 'Boom BOT-secreto', code: 200 } } },
    })
    const r = await sincronizarOrganico(base(m.f))
    expect(r.cuentas.find((c) => c.red === 'instagram')!.error).toBe('(#200) Boom ***')
    expect(JSON.stringify([m.payloads, r])).not.toContain('BOT-secreto')
  })

  it('un error de cuota en los insights individuales reintenta con backoff', async () => {
    const m = mundo({ ...unaIg, omitidos: ['ig-1-m1'], individual: { 'ig-1-m1': insightsIg(5) } })
    const original = m.f.getMockImplementation()!
    let primera = true
    m.f.mockImplementation(async (e, i) => {
      if (String(e).includes('/ig-1-m1/insights') && primera) {
        primera = false
        return json({ error: { message: 'límite', code: 4 } }, 400)
      }
      return original(e, i)
    })
    const esperar = vi.fn(async () => {})
    const r = await sincronizarOrganico({ ...base(m.f), esperar })
    expect(esperar).toHaveBeenCalledTimes(1)
    expect(r.cuentas.find((c) => c.red === 'instagram')).toMatchObject({ recuperadas: 1 })
  })

  it('FB: recupera con el page token y las métricas de posts', async () => {
    const m = mundo({ ...unaIg, porCuenta: 2, omitidos: ['page-1_p2'], individual: { 'page-1_p2': insightsFb } })
    const r = await sincronizarOrganico(base(m.f))
    const indiv = m.llamadas.filter((u) => u.pathname.endsWith('/insights') && u.searchParams.get('metric') !== METRICA_NUEVAS)
    expect(indiv).toHaveLength(1)
    expect(indiv[0]!.pathname).toBe('/v26.0/page-1_p2/insights')
    expect(indiv[0]!.searchParams.get('metric')).toBe('post_media_view,post_reactions_by_type_total,post_clicks')
    expect(indiv[0]!.searchParams.get('access_token')).toBe('PT-secreto-1')
    const pubId = m.filas('publicaciones').find((p) => p.meta_post_id === 'page-1_p2')!.id
    expect(m.filas('metricas_publicacion').find((x) => x.publicacion_id === pubId)).toMatchObject({
      vistas: 77,
      me_gusta: 3,
    })
    expect(r.cuentas.find((c) => c.red === 'facebook')).toMatchObject({ publicaciones: 2, recuperadas: 1, sinMetricas: 0 })
  })

  it('FB: con error #100 guarda el post con las métricas de insights en null', async () => {
    const m = mundo({ ...unaIg, omitidos: ['page-1_p1'], falla: { 'page-1_p1/insights': e100 } })
    const r = await sincronizarOrganico(base(m.f))
    const pubId = m.filas('publicaciones').find((p) => p.meta_post_id === 'page-1_p1')!.id
    expect(m.filas('metricas_publicacion').find((x) => x.publicacion_id === pubId)).toMatchObject({
      vistas: null,
      clics: null,
      me_gusta: 3,
    })
    expect(r.cuentas.find((c) => c.red === 'facebook')).toMatchObject({ recuperadas: 0, sinMetricas: 1 })
  })

  it('el page token no llega a la base, al resultado ni a la consola, ni siquiera con paging en los insights individuales', async () => {
    const consola = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
    ]
    const conPaging = { ...insightsFb, paging: { next: 'https://g/x?access_token=PT-secreto-1' } }
    const m = mundo({
      ...unaIg,
      omitidos: ['page-1_p1', 'ig-1-m1'],
      individual: { 'page-1_p1': conPaging },
      falla: { 'ig-1-m1/insights': { error: { message: 'x PT-secreto-1', code: 100 } } },
    })
    const r = await sincronizarOrganico(base(m.f))
    const todo = JSON.stringify([m.payloads, m.cambios, r, consola.map((c) => c.mock.calls)])
    expect(todo).not.toContain('PT-secreto')
    expect(todo).not.toContain('paging')
  })
})

describe('mensajes recibidos por cuenta (ADR-020)', () => {
  const una = { paginas: paginas(1) }
  // hoy = 2026-10-20 15:00Z (AR 12:00). Ventana de 90 días: 2026-07-23 .. 2026-10-20.
  const conv = (updated_time: string, message_count?: number) => ({
    updated_time,
    ...(message_count === undefined ? {} : { message_count }),
  })
  const mundoConMensajes = (extra: Opciones = {}) =>
    mundo({
      ...una,
      conversaciones: {
        'page-1:messenger': [
          conv('2026-10-20T02:00:00+0000', 4), // 23:00 AR del 19: cuenta para el 19
          conv('2026-10-19T15:00:00+0000', 3),
          conv('2026-10-10T12:00:00+0000', 10),
        ],
        'page-1:instagram': [
          conv('2026-10-19T20:00:00+0000', 0),
          conv('2026-10-19T10:00:00+0000', 0),
          conv('2026-10-05T10:00:00+0000', 0),
        ],
      },
      ...extra,
    })
  const filasCuenta = (m: ReturnType<typeof mundo>, tipo: string) => {
    const cuenta = m.filas('cuentas_meta').find((c) => c.tipo === tipo)!
    return m.filas('metricas_cuenta').filter((x) => x.cuenta_id === cuenta.id)
  }
  const dia = (filas: any[], fecha: string) => filas.find((x) => x.fecha === fecha)

  it('pide las conversaciones con el page token y SOLO updated_time,message_count, por plataforma', async () => {
    const m = mundoConMensajes()
    await sincronizarOrganico(base(m.f))
    const llamadas = m.llamadas.filter((u) => u.pathname === '/v26.0/page-1/conversations')
    expect(llamadas.map((u) => u.searchParams.get('platform')).sort()).toEqual(['instagram', 'messenger'])
    for (const u of llamadas) {
      expect(u.searchParams.get('fields')).toBe('updated_time,message_count')
      expect(u.searchParams.get('limit')).toBe('100')
      expect(u.searchParams.get('access_token')).toBe('PT-secreto-1')
    }
  })

  it('Messenger: conversaciones activas y mensajes por día argentino de su updated_time', async () => {
    const m = mundoConMensajes()
    await sincronizarOrganico(base(m.f))
    const fb = filasCuenta(m, 'facebook')
    expect(dia(fb, '2026-10-19')).toMatchObject({ conversaciones_activas: 2, mensajes: 7 })
    expect(dia(fb, '2026-10-10')).toMatchObject({ conversaciones_activas: 1, mensajes: 10 })
  })

  it('Instagram: solo conversaciones activas; mensajes queda null porque Meta no da message_count', async () => {
    const m = mundoConMensajes()
    await sincronizarOrganico(base(m.f))
    const ig = filasCuenta(m, 'instagram')
    expect(dia(ig, '2026-10-19')).toMatchObject({ conversaciones_activas: 2, mensajes: null })
    expect(dia(ig, '2026-10-05')).toMatchObject({ conversaciones_activas: 1 })
    expect(ig.every((x) => !('conversaciones_nuevas' in x) || x.conversaciones_nuevas == null)).toBe(true)
  })

  it('guarda los 90 días por cuenta, con 0 en los días sin conversaciones', async () => {
    const m = mundoConMensajes()
    await sincronizarOrganico(base(m.f))
    const fb = filasCuenta(m, 'facebook')
    expect(fb).toHaveLength(90)
    expect(fb.map((x) => x.fecha).sort()[0]).toBe('2026-07-23')
    expect(fb.map((x) => x.fecha).sort()[89]).toBe('2026-10-20')
    expect(dia(fb, '2026-10-01')).toMatchObject({ conversaciones_activas: 0, mensajes: 0 })
    expect(filasCuenta(m, 'instagram')).toHaveLength(90)
    expect(dia(filasCuenta(m, 'instagram'), '2026-10-01')).toMatchObject({ conversaciones_activas: 0, mensajes: null })
  })

  it('Messenger: conversaciones nuevas por día salen del insight de página (day = end_time - 1 día, hora AR)', async () => {
    const m = mundoConMensajes({
      nuevas: { 'page-1': [
        { end_time: '2026-10-20T07:00:00+0000', value: 2 }, // período que cierra el 20 → día 19
        { end_time: '2026-10-11T07:00:00+0000', value: 1 }, // día 10
      ] },
    })
    await sincronizarOrganico(base(m.f))
    const fb = filasCuenta(m, 'facebook')
    expect(dia(fb, '2026-10-19')).toMatchObject({ conversaciones_nuevas: 2 })
    expect(dia(fb, '2026-10-10')).toMatchObject({ conversaciones_nuevas: 1 })
    expect(dia(fb, '2026-10-01')).toMatchObject({ conversaciones_nuevas: 0 })
    const insight = m.llamadas.find((u) => u.pathname === '/v26.0/page-1/insights')!
    expect(insight.searchParams.get('metric')).toBe(METRICA_NUEVAS)
    expect(insight.searchParams.get('period')).toBe('day')
    expect(insight.searchParams.get('since')).toBe('2026-07-23')
    expect(insight.searchParams.get('until')).toBe('2026-10-21')
    expect(insight.searchParams.get('access_token')).toBe('PT-secreto-1')
  })

  it('corta la paginación al llegar a conversaciones más viejas que la ventana de 90 días', async () => {
    const m = mundo({
      ...una,
      tamPagina: 2,
      conversaciones: {
        'page-1:messenger': [
          conv('2026-10-19T15:00:00+0000', 1),
          conv('2026-10-18T15:00:00+0000', 1),
          conv('2026-07-20T15:00:00+0000', 1), // anterior al 23-jul: fuera de ventana
          conv('2026-07-19T15:00:00+0000', 1),
          conv('2026-07-01T15:00:00+0000', 1),
        ],
      },
    })
    await sincronizarOrganico(base(m.f))
    const pedidas = m.llamadas.filter((u) => u.pathname.endsWith('/conversations') && u.searchParams.get('platform') === 'messenger')
    expect(pedidas).toHaveLength(2) // la 3ª página no se pide
    const fb = filasCuenta(m, 'facebook')
    expect(fb.reduce((t, x) => t + x.conversaciones_activas, 0)).toBe(2)
  })

  it('re-correr no duplica: sigue habiendo una fila por cuenta y día', async () => {
    const m = mundoConMensajes()
    await sincronizarOrganico(base(m.f))
    await sincronizarOrganico(base(m.f))
    expect(m.filas('metricas_cuenta')).toHaveLength(180)
  })

  it('una página sin Instagram solo guarda las filas de Messenger y no pide conversations de IG', async () => {
    const m = mundo({ paginas: paginas(1, false) })
    await sincronizarOrganico(base(m.f))
    expect(m.filas('metricas_cuenta')).toHaveLength(90)
    const plataformas = m.llamadas.filter((u) => u.pathname.endsWith('/conversations')).map((u) => u.searchParams.get('platform'))
    expect(plataformas).toEqual(['messenger'])
  })

  it('si falla Instagram, igual guarda Messenger y los posts; la cuenta queda como falla parcial', async () => {
    const m = mundoConMensajes({ sinPermiso: ['instagram'] })
    const r = await sincronizarOrganico(base(m.f))
    expect(m.filas('publicaciones')).toHaveLength(2)
    expect(filasCuenta(m, 'facebook')).toHaveLength(90)
    expect(m.filas('metricas_cuenta').filter((x) => x.cuenta_id === m.filas('cuentas_meta').find((c) => c.tipo === 'instagram')!.id)).toHaveLength(0)
    expect(r.estado).toBe('parcial')
    expect(m.cambios.find((c) => c.tabla === 'sincronizaciones')!.cuerpo.estado).toBe('parcial')
    expect(r.error).toMatch(/page-1: mensajes: instagram: \(#10\) Permission denied/)
    expect(r.cuentas.find((c) => c.red === 'facebook')!.errorMensajes).toContain('Permission denied')
  })

  it('si falla el insight de nuevas, guarda activas y mensajes sin tocar conversaciones_nuevas', async () => {
    const m = mundoConMensajes({ nuevas: { 'page-1': [{ end_time: '2026-10-20T07:00:00+0000', value: 2 }] } })
    const original = m.f.getMockImplementation()!
    m.f.mockImplementation(async (e, i) =>
      String(e).includes(METRICA_NUEVAS) ? json({ error: { message: 'boom', code: 1 } }, 400) : original(e, i),
    )
    const r = await sincronizarOrganico(base(m.f))
    const fb = filasCuenta(m, 'facebook')
    expect(dia(fb, '2026-10-19')).toMatchObject({ conversaciones_activas: 2, mensajes: 7 })
    const enviadas = m.payloads.flat().filter((x: any) => x && 'conversaciones_activas' in x && 'mensajes' in x && x.crudo)
    expect(enviadas.some((x: any) => 'conversaciones_nuevas' in x && x.conversaciones_nuevas !== undefined && x.cuenta_id === fb[0].cuenta_id)).toBe(false)
    expect(r.estado).toBe('parcial')
  })

  it('tope de páginas: si no llega a la ventana, falla la cuenta en lugar de guardar conteos truncados', async () => {
    const muchas = Array.from({ length: 60 }, () => conv('2026-10-19T15:00:00+0000', 1))
    const m = mundo({ ...una, tamPagina: 1, conversaciones: { 'page-1:messenger': muchas } })
    const r = await sincronizarOrganico(base(m.f))
    expect(r.cuentas.find((c) => c.red === 'facebook')!.errorMensajes).toMatch(/tope/i)
    expect(filasCuenta(m, 'facebook')).toHaveLength(0)
    expect(m.filas('publicaciones')).toHaveLength(2)
  })

  it('PRIVACIDAD: ningún id de conversación, participante ni snippet llega a la base, al resultado ni a la consola', async () => {
    const consola = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
    ]
    const m = mundoConMensajes({ nuevas: { 'page-1': [{ end_time: '2026-10-20T07:00:00+0000', value: 2 }] } })
    const r = await sincronizarOrganico(base(m.f))
    const todo = JSON.stringify([m.payloads, m.cambios, r, consola.map((c) => c.mock.calls)])
    for (const secreto of ['CONV_SECRETA', 'Cliente Secreto', 'PSID_SECRETO', 'SECRETA', 'snippet', 'participants', 'PT-secreto', 'BOT-secreto', 'paging']) {
      expect(todo).not.toContain(secreto)
    }
  })

  it('el crudo guarda solo conteos agregados y el valor del insight', async () => {
    const m = mundoConMensajes({ nuevas: { 'page-1': [{ end_time: '2026-10-20T07:00:00+0000', value: 2 }] } })
    await sincronizarOrganico(base(m.f))
    expect(dia(filasCuenta(m, 'facebook'), '2026-10-19').crudo).toEqual({
      conversaciones: { activas: 2, mensajes: 7 },
      insight: { end_time: '2026-10-20T07:00:00+0000', value: 2 },
    })
    expect(dia(filasCuenta(m, 'instagram'), '2026-10-19').crudo).toEqual({ conversaciones: { activas: 2 } })
  })
})
