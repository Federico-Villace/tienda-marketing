import { describe, it, expect, vi, afterEach } from 'vitest'
import { hashPlaca, manejarPlaca } from './placa'
import { HEADER_USUARIO } from '../auth/acceso'
import { MARCAS } from '../datos/marcas'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { copyDePrueba, filaPromocion, ID_ESCENA, ID_FOTO, ID_PROMO } from './fixture'
import { plantillaDePrueba } from './referencia/fixture'
import { idsDeRecursosDe } from './diseno/recursos-ids'
import { leerManifiesto } from './logos-servidor'

const entorno = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_xyz' }
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 9, 9, 9])
const ESCENA = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const ID_LECTURA = '99999999-9999-4999-8999-999999999999'

const completa = (o: Record<string, unknown> = {}) =>
  filaPromocion({
    id: ID_PROMO, marca_id: MARCAS[3]!.id, foto_id: ID_FOTO, revision: 4, plantilla: 'referencia', fondo: 'estudio_oscuro', posicion_moto: 'centro',
    inspiracion_foto_id: 'ins', inspiracion_modo: 'diseno', referencia_diseno_id: ID_LECTURA,
    copy: copyDePrueba(), titular: 'Tu próxima aventura', escena_creativo_id: ID_ESCENA, ...o,
  } as never)

type Mundo = { promo?: Record<string, unknown>; lectura?: 'lista' | 'inutilizable' | 'inexistente'; plantilla?: unknown }
function mundo(o: Mundo = {}) {
  const subidas: string[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    const p = url.pathname
    if (p === '/rest/v1/miembros') return json([{ rol: 'director' }])
    if (p === '/rest/v1/promociones') return json([completa(o.promo ?? {})])
    if (p === '/rest/v1/referencias_diseno') {
      if (o.lectura === 'inexistente') return json([])
      const lista = (o.lectura ?? 'lista') === 'lista'
      return json([{ id: ID_LECTURA, estado: lista ? 'lista' : 'inutilizable', plantilla: lista ? (o.plantilla ?? plantillaDePrueba()) : null, fallback: lista ? null : 'deportiva', avisos: [], crudo: null }])
    }
    if (p === '/rest/v1/creativos') return json([{ id: ID_ESCENA, ruta: `${ORGANIZACION_PILOTO_ID}/g/1.jpg`, mime_type: 'image/jpeg', generaciones: { promocion_id: ID_PROMO, tanda_id: null } }])
    if (p.startsWith('/storage/v1/object/authenticated/creativos/')) return new Response(ESCENA)
    if (p === '/storage/v1/object/sign/creativos') return json(JSON.parse(String(init?.body)).paths.map((x: string) => ({ path: x, signedURL: `/object/sign/creativos/${x}?token=T`, error: null })))
    if (p.startsWith('/storage/v1/object/creativos/')) {
      subidas.push(p)
      return json({ Key: 'x' })
    }
    if (p === '/rest/v1/rpc/editar_promocion') {
      const a = JSON.parse(String(init?.body))
      return json(completa({ revision: a.p_revision + 1, placa_ruta: a.p_campos.placa_ruta, placa_hash: a.p_campos.placa_hash }))
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, subidas }
}
const componer = () => vi.fn(async (_p: unknown) => PNG)
const llamar = (m: ReturnType<typeof mundo>, c = componer()) =>
  manejarPlaca(new Request(`https://app.ejemplo.com/api/promociones/${ID_PROMO}/placa`, { method: 'POST', headers: { 'content-type': 'application/json', [HEADER_USUARIO]: 'u-1' }, body: JSON.stringify({ revision: 4 }) }), ID_PROMO, entorno, m.f, c)

afterEach(() => vi.restoreAllMocks())

describe('hashPlaca con la plantilla leída (ADR-039)', () => {
  const ref = plantillaDePrueba()!
  it('cambia con la lectura: otra lectura, otra placa; la misma, el mismo hash', () => {
    const base = hashPlaca(completa(), { referencia: ref }).hash
    expect(hashPlaca(completa(), { referencia: ref }).hash).toBe(base)
    expect(hashPlaca(completa(), { referencia: { ...ref, acento: '#FF0000' } }).hash).not.toBe(base)
    expect(hashPlaca(completa(), { referencia: { ...ref, moto: { ...ref.moto, x: ref.moto.x + 1 } } }).hash).not.toBe(base)
  })
  it('en las demás plantillas la lectura no cuenta: no se invalidan las placas ya hechas', () => {
    const otra = completa({ plantilla: 'deportiva' })
    expect(hashPlaca(otra, { referencia: ref }).hash).toBe(hashPlaca(otra).hash)
  })
  it('el formato y el diseño siguen contando', () => {
    const base = hashPlaca(completa(), { referencia: ref }).hash
    expect(hashPlaca(completa(), { referencia: ref, formato: '1:1' }).hash).not.toBe(base)
    expect(hashPlaca(completa({ diseno: { acento: 'rojo' } }), { referencia: ref }).hash).not.toBe(base)
  })
})

describe('componer la placa de la plantilla referencia', () => {
  it('lee la lectura LISTA de la promoción y se la pasa al compositor, junto con lo de siempre', async () => {
    const c = componer()
    const m = mundo()
    const r = await llamar(m, c)
    expect(r.status).toBe(200)
    const p = c.mock.calls[0]![0] as any
    expect(p).toMatchObject({ plantilla: 'referencia', posicionMoto: 'centro', aspecto: '4:5', formato: '4:5' })
    expect(p.referencia).toMatchObject({ ancho: 1080 })
    expect(p.referencia.modelo.fuente).toBeTruthy()
    expect(m.subidas).toHaveLength(1)
  })

  it('el logo de la concesionaria se elige por el tono del fondo LEÍDO, no por uno fijo', () => {
    const m = leerManifiesto()
    const oscuro = idsDeRecursosDe(m, MARCAS[1]!.id, 'referencia', null, 'oscuro')
    const claro = idsDeRecursosDe(m, MARCAS[1]!.id, 'referencia', null, 'claro')
    expect(oscuro.logoConcesionaria).not.toBeUndefined()
    expect(claro.logoConcesionaria).not.toBeUndefined()
    // Sin tono explícito, el de siempre de la plantilla (no se rompe a los otros llamadores).
    expect(idsDeRecursosDe(m, MARCAS[1]!.id, 'deportiva', null)).toEqual(idsDeRecursosDe(m, MARCAS[1]!.id, 'deportiva', null, undefined))
  })

  it('sin lectura lista (inutilizable, inexistente o sin id) es 422 y no se descarga, compone ni sube nada', async () => {
    for (const o of [{ lectura: 'inutilizable' as const }, { lectura: 'inexistente' as const }, { promo: { referencia_diseno_id: null } }]) {
      const c = componer()
      const m = mundo(o)
      const r = await llamar(m, c)
      expect(r.status).toBe(422)
      expect(((await r.json()) as any).error).toMatch(/referencia/i)
      expect(c).not.toHaveBeenCalled()
      expect(m.subidas).toHaveLength(0)
    }
  })
})
