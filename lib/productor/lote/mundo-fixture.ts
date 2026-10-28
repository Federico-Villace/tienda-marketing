/** Un mundo simulado para los tests de la compuerta de lote: Supabase y Gemini (que NO debe tocarse al estimar ni confirmar). Solo lo usan los tests. */

import { vi } from 'vitest'
import { ORGANIZACION_PILOTO_ID } from '../../organizacion'
import { MARCAS } from '../../datos/marcas'
import { filaPromocion } from '../../promocion/fixture'

export const ID_TANDA = '55555555-5555-4555-8555-555555555555'
export const ID_LOTE = '66666666-6666-4666-8666-666666666666'
export const ID_REF = '88888888-8888-4888-8888-888888888888'
export const foto = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const AHORA = Date.parse('2026-10-28T15:00:00Z')

export const entorno = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_xyz',
  GEMINI_API_KEY: 'AIza-SECRETISIMA-1234',
  PRESUPUESTO_MENSUAL_USD: '10',
}

/** Una hija de un lote de motos: moto `grupo` (foto propia) en la marca `marca`. */
export const hijaDeLote = (grupo: number, marca: number, o: Record<string, unknown> = {}) =>
  filaPromocion({
    id: `h${grupo}-${marca}`,
    marca_id: MARCAS[marca]!.id,
    modelo: `Moto ${grupo}`,
    tanda_id: ID_TANDA,
    grupo,
    foto_id: foto(grupo),
    plantilla: 'oferta_abajo',
    fondo: 'fondo_estudio',
    aspecto: '4:5',
    ...o,
  } as never)

export const request = (url: string, cuerpo: unknown = {}, usuario: string | null = 'u-1') =>
  new Request(`https://app.ejemplo.com${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(usuario ? { 'x-usuario-id': usuario } : {}) },
    body: JSON.stringify(cuerpo),
  })

export type Rpc = { nombre: string; args: any }
export type Mundo = {
  rol?: string | null
  tipo?: string | null
  hijas?: unknown[]
  fotos?: { faltan?: string[]; borradas?: string[] }
  ref?: 'ok' | 'borrada' | 'inexistente'
  gastado?: number
  rpc?: Record<string, (args: any) => Response>
  lote?: unknown[]
  generaciones?: unknown[]
  generacion?: unknown[]
  descarga?: 'ok' | 'falla' | 'vacia'
  gemini?: (url: string, init?: RequestInit) => Response
}

/** Supabase simulado. `gemini` registra cada llamada: en cada rechazo tiene que quedar en cero. */
export function mundo(o: Mundo = {}) {
  const rpcs: Rpc[] = []
  const gemini: string[] = []
  const patches: { tabla: string; query: string; body: any }[] = []
  const inserts: { tabla: string; body: any }[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    const p = url.pathname
    if (url.hostname.includes('googleapis')) {
      gemini.push(String(u))
      if (o.gemini) return o.gemini(String(u), init)
      throw new Error('Gemini no se llama acá')
    }
    if (url.hostname !== 'abc.supabase.co') throw new Error(`no se llama a ${url.hostname}`)
    if (p === '/rest/v1/miembros') return Response.json(o.rol === null ? [] : [{ rol: o.rol ?? 'director' }])
    if (p === '/rest/v1/tandas_promocion') return Response.json(o.tipo === null ? [] : [{ id: ID_TANDA, tipo: o.tipo ?? 'motos' }])
    if (p === '/rest/v1/promociones') return Response.json(o.hijas ?? [hijaDeLote(1, 3), hijaDeLote(2, 3), hijaDeLote(3, 3)])
    if (p === '/rest/v1/fotos') {
      const ids = (/^in\.\((.*)\)$/.exec(url.searchParams.get('id') ?? '')?.[1] ?? '').split(',').filter(Boolean)
      if (url.searchParams.get('uso') === 'eq.inspiracion') {
        if (o.ref === 'inexistente') return Response.json([])
        return Response.json(ids.map((id) => ({ id, ruta: o.ref === 'borrada' ? null : `org/${id}.jpg`, borrada_en: o.ref === 'borrada' ? '2026-10-20T00:00:00Z' : null })))
      }
      return Response.json(
        ids
          .filter((id) => !(o.fotos?.faltan ?? []).includes(id))
          .map((id) => ({ id, ruta: (o.fotos?.borradas ?? []).includes(id) ? null : `org/${id}.jpg`, borrada_en: (o.fotos?.borradas ?? []).includes(id) ? '2026-10-20T00:00:00Z' : null })),
      )
    }
    if (p === '/rest/v1/lotes_generacion') {
      expect(url.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
      return Response.json(o.lote ?? [])
    }
    if (p === '/rest/v1/generaciones' && (init?.method ?? 'GET') === 'GET') {
      expect(url.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
      return Response.json(url.searchParams.has('lote_id') ? (o.generaciones ?? []) : (o.generacion ?? []))
    }
    if (p === '/rest/v1/generaciones' && init?.method === 'PATCH') {
      patches.push({ tabla: 'generaciones', query: url.search, body: JSON.parse(String(init.body)) })
      return Response.json([{}])
    }
    if (p === '/rest/v1/creativos' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body))
      inserts.push({ tabla: 'creativos', body })
      return Response.json([{ id: `c-${body.orden}`, ...body }])
    }
    if (p === '/rest/v1/rpc/gasto_generaciones_mes') return Response.json(o.gastado ?? 0)
    if (p.startsWith('/rest/v1/rpc/')) {
      const nombre = p.split('/').pop()!
      const args = JSON.parse(String(init?.body))
      rpcs.push({ nombre, args })
      const h = o.rpc?.[nombre]
      if (!h) throw new Error(`RPC inesperada: ${nombre}`)
      return h(args)
    }
    if (p.startsWith('/storage/v1/object/sign/')) {
      const bucket = p.split('/').pop()!
      const b = JSON.parse(String(init?.body))
      return Response.json(b.paths.map((x: string) => ({ path: x, signedURL: `/object/sign/${bucket}/${x}?token=T`, error: null })))
    }
    if (p.startsWith('/storage/v1/object/authenticated/')) {
      if (o.descarga === 'falla') return new Response('x', { status: 500 })
      return new Response(o.descarga === 'vacia' ? new Uint8Array(0) : new Uint8Array([1, 2, 3]), { status: 200 })
    }
    if (p.startsWith('/storage/v1/object/')) return Response.json({ Key: 'x' })
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, rpcs, gemini, patches, inserts }
}
