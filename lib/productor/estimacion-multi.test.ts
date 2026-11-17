import { describe, it, expect, vi } from 'vitest'
import { HEADER_USUARIO } from '../auth/acceso'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { manejarEstimacion } from './estimacion'
import { promptCopiaFielMulti, VERSION_PROMPT_COPIA_MULTI } from '../promocion/copia/prompt-multi'
import { textosCopiaFiel } from '../promocion/copia/textos'
import { hashTextos } from '../promocion/copia/hash-textos'
import { estimarCopiaFiel, imagenesDeEntradaCopia } from '../promocion/copia/precios'
import { filaPromocion, ID_FOTO, ID_PROMO } from '../promocion/fixture'
import { MARCAS } from '../datos/marcas'
import type { MotoExtra } from '../promocion/varias/tipos'

const ID_REF = '88888888-8888-4888-8888-888888888888'
const F2 = '22222222-2222-4222-8222-222222222222'
const F3 = '33333333-3333-4333-8333-333333333333'
const F4 = '99999999-9999-4999-8999-999999999999'
const ID_CREATIVO = '66666666-6666-4666-8666-666666666666'
const ID_GEN_BASE = '77777777-7777-4777-8777-777777777777'
const GEN_ID = '44444444-4444-4444-8444-444444444444'
const entorno = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_xyz', GEMINI_API_KEY: 'AIza-SECRETISIMA-1234', PRESUPUESTO_MENSUAL_USD: '10' }
const AHORA = Date.parse('2026-11-18T15:00:00Z')
const PRO = 'gemini-3-pro-image'
const NANO = 'gemini-nano-banana-2.1'

const extra = (fotoId: string, n: number): MotoExtra => ({ fotoId, modelo: `MOTO ${n}`, precio: { moneda: 'ARS', monto: n * 1_000_000 }, promo: { tipo: 'ninguna', detalle: '' } })
const EXTRAS = [extra(F2, 2), extra(F3, 3)]
const varias = (o: Record<string, unknown> = {}) =>
  filaPromocion({ id: ID_PROMO, foto_id: ID_FOTO, plantilla: 'copia_fiel', fondo: null, aspecto: '4:5', inspiracion_foto_id: ID_REF, inspiracion_modo: 'diseno', modelo: 'ROUSER 200', titular: 'Elegí la tuya', motos_extra: EXTRAS, ...o } as never)

type Mundo = { promo?: Record<string, unknown>; fotos?: Record<string, 'viva' | 'borrada' | 'inexistente'>; creativo?: Record<string, unknown>; gen?: Record<string, unknown> }
function mundo(o: Mundo = {}) {
  const inserts: Record<string, any>[] = []
  const gemini: string[] = []
  const consultasFotos: URL[] = []
  const estado = (id: string) => o.fotos?.[id] ?? 'viva'
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    if (url.hostname.includes('googleapis')) {
      gemini.push(String(u))
      throw new Error('Gemini no se llama al estimar')
    }
    if (url.pathname === '/rest/v1/miembros') return Response.json([{ rol: 'director' }])
    if (url.pathname === '/rest/v1/promociones') return Response.json([varias(o.promo ?? {})])
    if (url.pathname === '/rest/v1/fotos') {
      consultasFotos.push(url)
      const filtro = url.searchParams.get('id') ?? ''
      const ids = filtro.startsWith('in.(') ? filtro.slice(4, -1).split(',') : [filtro.replace('eq.', '')]
      return Response.json(
        ids
          .filter((id) => estado(id) !== 'inexistente')
          .map((id) => ({ id, ruta: estado(id) === 'borrada' ? null : `org/${id}.jpg`, borrada_en: estado(id) === 'borrada' ? '2026-11-10T00:00:00Z' : null })),
      )
    }
    if (url.pathname === '/rest/v1/creativos') return Response.json([{ id: ID_CREATIVO, generacion_id: ID_GEN_BASE, ruta: 'org/g/1.jpg', aspecto: '4:5', ...o.creativo }])
    if (url.pathname === '/rest/v1/generaciones' && (init?.method ?? 'GET') === 'GET') {
      return Response.json([{ id: ID_GEN_BASE, foto_id: ID_FOTO, edicion: 'promocion', promocion_id: ID_PROMO, tanda_id: null, grupo: null, pieza_id: null, pieza_raiz_id: null, parametros: {}, ...o.gen }])
    }
    if (url.pathname === '/rest/v1/rpc/gasto_generaciones_mes') return Response.json(0)
    if (url.pathname === '/rest/v1/generaciones' && init?.method === 'POST') {
      const cuerpo = JSON.parse(String(init.body))
      inserts.push(cuerpo)
      return Response.json([{ id: GEN_ID, ...cuerpo }])
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, inserts, gemini, consultasFotos }
}
const pedido = (cuerpo: unknown) => new Request('https://app.ejemplo.com/api/generaciones', { method: 'POST', headers: { 'content-type': 'application/json', [HEADER_USUARIO]: 'u-1' }, body: JSON.stringify(cuerpo) })
const estimar = (m: ReturnType<typeof mundo>, cuerpo: unknown, env: Record<string, string> = entorno) => manejarEstimacion(pedido(cuerpo), env, m.f, () => AHORA)
const okPromo = { promocionId: ID_PROMO, motor: PRO, cantidad: 1 }
const textosDe = (fila = varias()) => textosCopiaFiel(fila, { negocio: MARCAS[3]!.nombre, logoDibujable: false })

describe('copia fiel de varias motos: estimar', () => {
  it('guarda el prompt multi, los textos por moto, su hash, el modelo que verifica y las fotos extra EN ORDEN; NO llama a Gemini', async () => {
    const m = mundo()
    const r = await estimar(m, okPromo)
    expect(r.status).toBe(201)
    expect(m.gemini).toHaveLength(0)
    const t = textosDe()
    expect(m.inserts[0]).toMatchObject({
      organizacion_id: ORGANIZACION_PILOTO_ID, tipo: 'imagen', motor: PRO, cantidad: 1, aspecto: '4:5', foto_id: ID_FOTO, referencia_foto_id: ID_REF,
      edicion: 'promocion', promocion_id: ID_PROMO, version_prompt: VERSION_PROMPT_COPIA_MULTI, prompt: promptCopiaFielMulti({ aspecto: '4:5', textos: t }),
      textos_esperados: t, textos_hash: hashTextos(t), modelo_verificacion: 'gemini-4-argon',
    })
    expect(m.inserts[0]!.parametros.fotosExtra).toEqual([F2, F3])
    expect(m.inserts[0]!.textos_esperados.motos).toHaveLength(3)
  })
  it('el precio cuenta una foto de entrada por moto más la referencia (4 con 3 motos)', async () => {
    const m = mundo()
    const body = await (await estimar(m, okPromo)).json()
    const e = estimarCopiaFiel(PRO, 1, 'gemini-4-argon', imagenesDeEntradaCopia(3))
    expect(body.costoEstimadoUsd).toBeCloseTo(e.topeTotalUsd, 6)
    expect(m.inserts[0]!.costo_estimado_usd).toBeCloseTo(e.topeTotalUsd, 6)
    // y es más que la de una moto sola (0,23724)
    expect(body.costoEstimadoUsd).toBeGreaterThan(0.23724)
    expect(body.generacion).toMatchObject({ copiaFiel: true, verificacionUsd: 0.05 })
  })
  it('con 4 motos y Nano Banana: más entrada que con 2', async () => {
    const dos = await (await estimar(mundo({ promo: { motos_extra: [extra(F2, 2)] } }), { ...okPromo, motor: NANO })).json()
    const cuatro = await (await estimar(mundo({ promo: { motos_extra: [extra(F2, 2), extra(F3, 3), extra(F4, 4)] } }), { ...okPromo, motor: NANO })).json()
    expect(cuatro.costoEstimadoUsd).toBeGreaterThan(dos.costoEstimadoUsd)
    expect(cuatro.costoEstimadoUsd - dos.costoEstimadoUsd).toBeCloseTo(2 * 1120 * 1.5 / 1e6, 5)
  })
  it('2 variantes: dos imágenes (con todas las entradas) y dos revisiones', async () => {
    const una = await (await estimar(mundo(), okPromo)).json()
    const dos = await (await estimar(mundo(), { ...okPromo, cantidad: 2 })).json()
    expect(dos.costoEstimadoUsd).toBeCloseTo(una.costoEstimadoUsd * 2, 6)
  })
  it('las fotos de las otras motos se buscan juntas, como foto de moto y de la organización', async () => {
    const m = mundo()
    await estimar(m, okPromo)
    const consulta = m.consultasFotos.filter((u) => (u.searchParams.get('id') ?? '').startsWith('in.('))
    expect(consulta).toHaveLength(1)
    expect(consulta[0]!.searchParams.get('id')).toBe(`in.(${F2},${F3})`)
    expect(consulta[0]!.searchParams.get('uso')).toBe('eq.moto')
    expect(consulta[0]!.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
  })
  it('una foto extra inexistente 404, borrada 410: sin crear nada ni llamar a Gemini', async () => {
    for (const [mu, st] of [[mundo({ fotos: { [F3]: 'inexistente' } }), 404], [mundo({ fotos: { [F2]: 'borrada' } }), 410]] as const) {
      expect((await estimar(mu, okPromo)).status).toBe(st)
      expect(mu.inserts).toHaveLength(0)
      expect(mu.gemini).toHaveLength(0)
    }
  })
  it('lo que la persona sacó (precio) entra al snapshot de cada moto y al prompt', async () => {
    const m = mundo({ promo: { diseno: { ocultos: ['precio'] } } })
    await estimar(m, okPromo)
    expect(m.inserts[0]!.textos_esperados.motos.map((x: { precio: string | null }) => x.precio)).toEqual([null, null, null])
    expect(m.inserts[0]!.prompt).toContain('ELEMENTOS SACADOS')
    expect(m.inserts[0]!.prompt).not.toContain('$')
  })
  it('un formato distinto (otro tamaño) en una aprobada usa las mismas fotos', async () => {
    const m = mundo({ promo: { estado: 'aprobada' } })
    const r = await estimar(m, { ...okPromo, formato: '1:1' })
    expect(r.status).toBe(201)
    expect(m.inserts[0]).toMatchObject({ aspecto: '1:1' })
    expect(m.inserts[0]!.parametros).toMatchObject({ formatoExtra: true, fotosExtra: [F2, F3] })
  })
  it('una promoción de una sola moto no lleva fotosExtra ni prompt multi', async () => {
    const m = mundo({ promo: { motos_extra: null } })
    await estimar(m, okPromo)
    expect(m.inserts[0]!.parametros.fotosExtra).toBeUndefined()
    expect(m.inserts[0]!.version_prompt).not.toBe(VERSION_PROMPT_COPIA_MULTI)
    expect(m.inserts[0]!.textos_esperados.motos).toBeUndefined()
  })
  it('el cliente no puede mandar fotos ni precios: se ignoran', async () => {
    const m = mundo()
    await estimar(m, { ...okPromo, fotosExtra: ['x'], costoEstimadoUsd: 0.0001, motos: [] })
    expect(m.inserts[0]!.parametros.fotosExtra).toEqual([F2, F3])
    expect(m.inserts[0]!.costo_estimado_usd).toBeGreaterThan(0.2)
  })
})

describe('Pedile un cambio sobre una imagen de varias motos', () => {
  const baseMulti = { textos_esperados: textosDe(), textos_hash: hashTextos(textosDe()), modelo_verificacion: 'gemini-4-argon', parametros: { fotosExtra: [F2, F3] } }
  it('no se ofrece: el cambio no lleva las fotos de las otras motos (422), sin crear ni llamar', async () => {
    const m = mundo({ gen: baseMulti })
    const r = await estimar(m, { creativoId: ID_CREATIVO, promocionId: ID_PROMO, instruccion: 'Hacé el fondo más oscuro', cantidad: 1 })
    expect(r.status).toBe(422)
    expect((await r.json()).error).toMatch(/varias motos/)
    expect(m.inserts).toHaveLength(0)
    expect(m.gemini).toHaveLength(0)
  })
})
