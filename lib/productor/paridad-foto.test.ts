import { describe, it, expect, vi } from 'vitest'
import { HEADER_USUARIO } from '../auth/acceso'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { manejarEstimacion, leerOrigen } from './estimacion'
import { promptFoto } from './prompt'
import { estimarImagenes } from './precios'
import { TEXTO_REFERENCIA } from '../imagenes/fondos'
import { filaPromocion, ID_PROMO } from '../promocion/fixture'

const FOTO = '11111111-1111-4111-8111-111111111111'
const REF = '88888888-8888-4888-8888-888888888888'
const GEN_ID = '44444444-4444-4444-8444-444444444444'
const entorno = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_xyz',
  GEMINI_API_KEY: 'AIza-SECRETISIMA-1234',
  PRESUPUESTO_MENSUAL_USD: '10',
}
const AHORA = Date.parse('2026-10-26T15:00:00Z')
const base = { fotoId: FOTO, edicion: 'fondo_estudio', aspecto: '4:5', motor: 'gemini-nano-banana-2.1', cantidad: 1 }

function mundo(o: { ref?: 'ok' | 'inexistente' | 'borrada'; promo?: Record<string, unknown> } = {}) {
  const inserts: Record<string, any>[] = []
  const gemini: string[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    if (url.hostname.includes('googleapis')) {
      gemini.push(String(u))
      throw new Error('Gemini no se llama al estimar')
    }
    if (url.pathname === '/rest/v1/miembros') return Response.json([{ rol: 'director' }])
    if (url.pathname === '/rest/v1/promociones')
      return Response.json([filaPromocion({ id: ID_PROMO, foto_id: FOTO, plantilla: 'oferta_abajo', fondo: 'solo_formato', aspecto: '4:5', ...o.promo } as never)])
    if (url.pathname === '/rest/v1/fotos') {
      if (url.searchParams.get('id') === `eq.${REF}`) {
        expect(url.searchParams.get('uso')).toBe('eq.inspiracion')
        if (o.ref === 'inexistente') return Response.json([])
        return Response.json([{ id: REF, ruta: o.ref === 'borrada' ? null : 'org/r.jpg', borrada_en: o.ref === 'borrada' ? '2026-10-20T00:00:00Z' : null }])
      }
      return Response.json([{ id: FOTO, ruta: 'org/f.jpg', borrada_en: null }])
    }
    if (url.pathname === '/rest/v1/rpc/gasto_generaciones_mes') return Response.json(0)
    if (url.pathname === '/rest/v1/generaciones' && init?.method === 'POST') {
      const cuerpo = JSON.parse(String(init.body))
      inserts.push(cuerpo)
      return Response.json([{ id: GEN_ID, ...cuerpo }])
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, inserts, gemini }
}
const pedido = (cuerpo: unknown) =>
  new Request('https://app.ejemplo.com/api/generaciones', {
    method: 'POST',
    headers: { 'content-type': 'application/json', [HEADER_USUARIO]: 'u-1' },
    body: JSON.stringify(cuerpo),
  })

describe('/creativos pide el fondo como una promoción (descripción, inspiración, solo mi descripción)', () => {
  it('descripción + inspiración: prompt v2 con la misma frase de fondo, referencia como 2ª entrada y su costo', async () => {
    const m = mundo()
    const r = await manejarEstimacion(pedido({ ...base, descripcion: ' de noche   con lluvia ', inspiracionFotoId: REF }), entorno, m.f, () => AHORA)
    expect(r.status).toBe(201)
    expect(m.gemini).toHaveLength(0)
    const fila = m.inserts[0]!
    expect(fila).toMatchObject({
      foto_id: FOTO,
      edicion: 'fondo_estudio',
      referencia_foto_id: REF,
      version_prompt: 'productor-foto-v2',
      prompt: promptFoto('fondo_estudio', '4:5', { descripcion: 'de noche con lluvia', conReferencia: true }),
      costo_estimado_usd: estimarImagenes('gemini-nano-banana-2.1', 1, { conFoto: true, conReferencia: true }).topeTotalUsd,
      parametros: { escena: { fondo: 'fondo_estudio', descripcion: 'de noche con lluvia', conInspiracion: true, posicionMoto: null } },
    })
    expect(fila.prompt).toContain('«de noche con lluvia»')
    expect(fila.prompt).toContain(TEXTO_REFERENCIA)
    expect(fila.prompt.indexOf('Reglas obligatorias')).toBeGreaterThan(fila.prompt.indexOf('«de noche con lluvia»'))
  })

  it('sin descripción ni inspiración el pedido de siempre sigue igual (y espacio_texto sigue disponible)', async () => {
    const m = mundo()
    const r = await manejarEstimacion(pedido({ ...base, edicion: 'espacio_texto' }), entorno, m.f, () => AHORA)
    expect(r.status).toBe(201)
    expect(m.inserts[0]).toMatchObject({ edicion: 'espacio_texto', prompt: promptFoto('espacio_texto', '4:5') })
    expect(m.inserts[0]).not.toHaveProperty('referencia_foto_id')
  })

  it('"solo mi descripción" sin descripción ni inspiración: 422; con solo la inspiración: ok', async () => {
    const a = mundo()
    expect((await manejarEstimacion(pedido({ ...base, edicion: 'solo_descripcion' }), entorno, a.f, () => AHORA)).status).toBe(422)
    expect(a.inserts).toHaveLength(0)
    const b = mundo()
    expect((await manejarEstimacion(pedido({ ...base, edicion: 'solo_descripcion', inspiracionFotoId: REF }), entorno, b.f, () => AHORA)).status).toBe(201)
  })

  it.each([
    ['inexistente', 404],
    ['borrada', 410],
  ] as const)('inspiración %s: %s sin Gemini ni filas', async (ref, status) => {
    const m = mundo({ ref })
    const r = await manejarEstimacion(pedido({ ...base, inspiracionFotoId: REF }), entorno, m.f, () => AHORA)
    expect(r.status).toBe(status)
    expect(m.gemini).toHaveLength(0)
    expect(m.inserts).toHaveLength(0)
  })

  it('una descripción de más de 300 caracteres o una inspiración con id inválido: 400', () => {
    expect(leerOrigen({ ...base, descripcion: 'a'.repeat(301) })).toHaveProperty('error')
    expect(leerOrigen({ ...base, inspiracionFotoId: 'x' })).toHaveProperty('error')
  })
})

describe('promoción con "mantener el fondo de la foto" (solo_formato)', () => {
  it('se estima y el prompt de la escena no cambia el fondo', async () => {
    const m = mundo()
    const r = await manejarEstimacion(pedido({ promocionId: ID_PROMO, motor: 'gemini-nano-banana-2.1', cantidad: 2 }), entorno, m.f, () => AHORA)
    expect(r.status).toBe(201)
    expect(m.inserts[0]!.prompt).toMatch(/No cambies el fondo/)
    expect(m.inserts[0]!.version_prompt).toBe('promocion-escena-v3')
  })
})
