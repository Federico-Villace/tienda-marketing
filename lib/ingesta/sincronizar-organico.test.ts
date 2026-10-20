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
}

/**
 * Meta y Supabase falsos. Supabase respeta `on_conflict`: re-escribir la misma
 * clave pisa la fila en lugar de duplicarla, como Postgres.
 */
function mundo({ paginas: ps = paginas(2), falla = {}, pagingConToken = false }: Opciones = {}) {
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
    if (ruta.endsWith('/media')) {
      const ig = ruta.split('/')[0]!
      return json({
        data: [
          {
            id: `${ig}-m1`,
            media_type: 'IMAGE',
            timestamp: '2026-10-01T15:00:00+0000',
            insights: {
              data: [{ name: 'views', values: [{ value: 10 }] }],
              ...(pagingConToken ? { paging: { next: 'https://g/x?access_token=PT-secreto-1' } } : {}),
            },
          },
        ],
      })
    }
    if (ruta.endsWith('/posts')) {
      const pagina = ruta.split('/')[0]!
      return json({
        data: [
          {
            id: `${pagina}_p1`,
            created_time: '2026-10-02T12:00:00+0000',
            reactions: { summary: { total_count: 3 } },
            insights: { data: [{ name: 'post_media_view', values: [{ value: 50 }] }] },
          },
        ],
      })
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
    expect(r.estado).toBe('error')
    expect(r.cuentas).toHaveLength(4)
    expect(r.cuentas.filter((c) => c.error)).toHaveLength(1)
    expect(m.filas('publicaciones')).toHaveLength(3)
    expect(r.error).toContain('page-2: (#200) Missing Permissions')
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
