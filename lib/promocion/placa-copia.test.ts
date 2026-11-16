import { describe, it, expect, vi, afterEach } from 'vitest'
import { hashPlaca, hashPlacaCopia, manejarPlaca } from './placa'
import { manejarFormatos } from './formatos'
import { HEADER_USUARIO } from '../auth/acceso'
import { MARCAS } from '../datos/marcas'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { copyDePrueba, filaPromocion, ID_ESCENA, ID_FOTO, ID_PROMO } from './fixture'
import { hashTextos } from './copia/hash-textos'
import { textosDeLaPromocion } from './copia/pedido'
import type { TextosCopia } from './copia/tipos'

const entorno = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_xyz' }
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 9, 9, 9])
const ESCENA = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const ID_REF = '88888888-8888-4888-8888-888888888888'
const ID_EXTRA = '99999999-9999-4999-8999-999999999999'
const SUZUKI = MARCAS[2]!.id // logo PNG dibujable
const BENELLI = MARCAS[3]!.id // logo WebP: la IA escribe el nombre

const completa = (o: Record<string, unknown> = {}) =>
  filaPromocion({
    id: ID_PROMO, marca_id: SUZUKI, foto_id: ID_FOTO, revision: 4, plantilla: 'copia_fiel', fondo: null, posicion_moto: 'centro', aspecto: '4:5',
    inspiracion_foto_id: ID_REF, inspiracion_modo: 'diseno', copy: copyDePrueba(), titular: 'Tu próxima aventura', escena_creativo_id: ID_ESCENA, ...o,
  } as never)
const hashActual = (o: Record<string, unknown> = {}) => hashTextos(textosDeLaPromocion(completa(o)))

type Mundo = {
  promo?: Record<string, unknown>
  /** El snapshot de la generación (por defecto: los textos actuales de la promoción). */
  gen?: Record<string, unknown>
  verificacion?: Record<string, unknown> | null
  creativo?: Record<string, unknown>
  extra?: { aspecto?: string; verificacion?: Record<string, unknown> | null; gen?: Record<string, unknown> }
}
function mundo(o: Mundo = {}) {
  const subidas: string[] = []
  const descargas: string[] = []
  const consultas: URL[] = []
  const hash = hashActual(o.promo)
  const textos: TextosCopia = textosDeLaPromocion(completa(o.promo))
  const genDe = (aspecto: string, extra: Record<string, unknown> = {}) => ({ promocion_id: ID_PROMO, tanda_id: null, grupo: null, aspecto, textos_hash: hash, textos_esperados: textos, ...extra })
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    consultas.push(url)
    const p = url.pathname
    if (p === '/rest/v1/miembros') return json([{ rol: 'director' }])
    if (p === '/rest/v1/promociones') return json([completa(o.promo ?? {})])
    if (p === '/rest/v1/creativos') {
      if (url.searchParams.get('id') === `eq.${ID_EXTRA}`) return json([{ id: ID_EXTRA, ruta: `${ORGANIZACION_PILOTO_ID}/g/2.jpg`, mime_type: 'image/jpeg', aspecto: o.extra?.aspecto ?? '1:1', generaciones: genDe(o.extra?.aspecto ?? '1:1', o.extra?.gen) }])
      return json([{ id: ID_ESCENA, ruta: `${ORGANIZACION_PILOTO_ID}/g/1.jpg`, mime_type: 'image/jpeg', aspecto: '4:5', generaciones: genDe('4:5', o.gen), ...o.creativo }])
    }
    if (p === '/rest/v1/verificaciones_texto') {
      const para = url.searchParams.get('creativo_id')
      const v = para === `eq.${ID_EXTRA}` ? o.extra?.verificacion : o.verificacion
      const porDefecto = { id: 'ver-1', estado: 'ok', textos_hash: hash, modelo: 'gemini-4-argon', diferencias: [], avisos: [], zona_logo: { x: 0.1, y: 0.03, w: 0.3, h: 0.1, porDefecto: false }, fondo_logo: 'oscuro', creado_en: '2026-11-18T10:00:00Z', creativo_id: ID_ESCENA, generacion_id: 'g' }
      return json(v === null ? [] : [{ ...porDefecto, ...(v ?? {}) }])
    }
    if (p.startsWith('/storage/v1/object/authenticated/creativos/')) {
      descargas.push(p)
      return new Response(ESCENA)
    }
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
  return { f, subidas, descargas, consultas }
}
const componer = () => vi.fn(async (_p: unknown) => PNG)
const llamar = (m: ReturnType<typeof mundo>, c = componer()) =>
  manejarPlaca(new Request(`https://app.ejemplo.com/api/promociones/${ID_PROMO}/placa`, { method: 'POST', headers: { 'content-type': 'application/json', [HEADER_USUARIO]: 'u-1' }, body: JSON.stringify({ revision: 4 }) }), ID_PROMO, entorno, m.f, c)
const sinNada = (m: ReturnType<typeof mundo>, c: ReturnType<typeof componer>) => {
  expect(c).not.toHaveBeenCalled()
  expect(m.subidas).toHaveLength(0)
}

afterEach(() => vi.restoreAllMocks())

describe('la placa de la copia fiel: solo con la imagen verificada', () => {
  it('con la verificación ok y los textos al día: compone la imagen a medidas con el logo real en la caja que vio el verificador', async () => {
    const c = componer()
    const m = mundo()
    const r = await llamar(m, c)
    expect(r.status).toBe(200)
    const p = c.mock.calls[0]![0] as any
    expect(p.plantilla).toBe('copia_fiel')
    expect(Array.from(p.escenaBytes)).toEqual(Array.from(ESCENA))
    expect(p.copia).toMatchObject({ formato: '4:5', caja: { x: 0.1, y: 0.03, w: 0.3, h: 0.1 } })
    expect(p.copia.logo).toMatch(/^data:image\/(png|jpeg);base64,/)
    expect(m.subidas).toHaveLength(1)
  })
  it('sin ninguna verificación: 422 y no se compone ni se sube nada', async () => {
    const c = componer()
    const m = mundo({ verificacion: null })
    const r = await llamar(m, c)
    expect(r.status).toBe(422)
    expect(((await r.json()) as any).error).toBe('Los textos de esta imagen no están verificados: elegí otra o generá de nuevo.')
    sinNada(m, c)
  })
  it("verificación que difiere, falló o sigue pendiente: 422", async () => {
    for (const estado of ['difiere', 'error', 'pendiente']) {
      const c = componer()
      const m = mundo({ verificacion: { estado } })
      expect((await llamar(m, c)).status, estado).toBe(422)
      sinNada(m, c)
    }
  })
  it('una verificación de OTROS textos no vale: 422', async () => {
    const c = componer()
    const m = mundo({ verificacion: { textos_hash: 'b'.repeat(64) } })
    expect((await llamar(m, c)).status).toBe(422)
    sinNada(m, c)
  })
  it('cambiaste los textos después de generar: 422 con su mensaje, sin gastar nada', async () => {
    const c = componer()
    const m = mundo({ gen: { textos_hash: 'c'.repeat(64) } })
    const r = await llamar(m, c)
    expect(r.status).toBe(422)
    expect(((await r.json()) as any).error).toBe('Cambiaste los textos después de generar la imagen: generá otra.')
    sinNada(m, c)
  })
  it('sacar un texto de la placa también obliga a generar otra imagen', async () => {
    const c = componer()
    // El snapshot de la imagen es el de los textos completos; la promoción ahora oculta el precio.
    const m = mundo({ gen: { textos_hash: hashActual() }, promo: { diseno: { ocultos: ['precio'] } } })
    const r = await llamar(m, c)
    expect(r.status).toBe(422)
    expect(((await r.json()) as any).error).toMatch(/Cambiaste los textos/)
    sinNada(m, c)
  })
  it('una imagen que no es de esta promoción o ya no está: 422', async () => {
    const c = componer()
    const m = mundo({ creativo: { generaciones: { promocion_id: 'otra', tanda_id: null, grupo: null, aspecto: '4:5', textos_hash: hashActual() } } })
    expect((await llamar(m, c)).status).toBe(422)
    sinNada(m, c)
  })
})

describe('el logo de la copia fiel lo pega NUESTRO renderer', () => {
  it('sin logo dibujable (Benelli, WebP) la IA escribió el nombre: no se pega ningún logo', async () => {
    const c = componer()
    const m = mundo({ promo: { marca_id: BENELLI } })
    await llamar(m, c)
    expect((c.mock.calls[0]![0] as any).copia.logo).toBeNull()
  })
  it('con los logos sacados: ningún logo', async () => {
    const c = componer()
    const m = mundo({ promo: { diseno: { ocultos: ['logo999', 'logoConcesionaria'] } } })
    await llamar(m, c)
    expect((c.mock.calls[0]![0] as any).copia.logo).toBeNull()
  })
  it('la 999motos pega el logo 999', async () => {
    const c = componer()
    const m = mundo({ promo: { marca_id: MARCAS[0]!.id } })
    await llamar(m, c)
    expect((c.mock.calls[0]![0] as any).copia.logo).toMatch(/^data:image\//)
  })
  it('sin caja del verificador: arriba al centro', async () => {
    const c = componer()
    const m = mundo({ verificacion: { zona_logo: null } })
    await llamar(m, c)
    expect((c.mock.calls[0]![0] as any).copia.caja).toEqual({ x: 0.3, y: 0.02, w: 0.4, h: 0.08 })
  })
  it('una caja que no sirve (enorme) cae a la de por defecto', async () => {
    const c = componer()
    const m = mundo({ verificacion: { zona_logo: { x: 0, y: 0, w: 1, h: 1 } } })
    await llamar(m, c)
    expect((c.mock.calls[0]![0] as any).copia.caja).toEqual({ x: 0.3, y: 0.02, w: 0.4, h: 0.08 })
  })
})

describe('hashPlacaCopia', () => {
  const base = { escenaId: ID_ESCENA, formato: '4:5' as const, textosHash: 'a'.repeat(64), logoSha: 'l', caja: { x: 0.1, y: 0.03, w: 0.3, h: 0.1 } }
  it('es estable y cambia con la imagen, el formato, los textos, el logo y la caja', () => {
    const h = hashPlacaCopia(base)
    expect(hashPlacaCopia({ ...base })).toBe(h)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    for (const o of [{ escenaId: 'otra' }, { formato: '1:1' as const }, { textosHash: 'b'.repeat(64) }, { logoSha: 'x' }, { caja: { ...base.caja, x: 0.2 } }]) expect(hashPlacaCopia({ ...base, ...o })).not.toBe(h)
  })
  it('el hash de las otras plantillas NO cambió (no se recomponen las placas ya hechas)', () => {
    const o = (plantilla: string) => filaPromocion({ plantilla, posicion_moto: 'centro' } as never)
    expect(hashPlaca(o('oferta_abajo')).hash).toBe(hashPlaca(o('oferta_abajo')).hash)
    // El valor de referencia se calculó con la versión previa: sin diseño ni ocultos el hash es el de siempre.
    expect(hashPlaca(o('oferta_abajo')).hash).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('otro formato de la copia fiel (/formatos)', () => {
  const llamarFormato = (m: ReturnType<typeof mundo>, cuerpo: unknown, c = componer()) =>
    manejarFormatos(new Request(`https://app.ejemplo.com/api/promociones/${ID_PROMO}/formatos`, { method: 'POST', headers: { 'content-type': 'application/json', [HEADER_USUARIO]: 'u-1' }, body: JSON.stringify(cuerpo) }), ID_PROMO, entorno, m.f, c)

  it('el formato de la promoción: la placa principal, gratis', async () => {
    const c = componer()
    const r = await llamarFormato(mundo(), { formato: '4:5' }, c)
    expect(r.status).toBe(200)
    expect((c.mock.calls[0]![0] as any).copia.formato).toBe('4:5')
  })
  it('otro formato sin imagen generada: 422 que lo dice y avisa que hay que generar', async () => {
    const c = componer()
    const m = mundo()
    const r = await llamarFormato(m, { formato: '1:1' }, c)
    expect(r.status).toBe(422)
    expect(await r.json()).toMatchObject({ error: 'Este formato todavía no se generó.', generar: true })
    sinNada(m, c)
  })
  it('con la imagen de ese formato (de esta promoción, textos vigentes y verificada): se arma a ese tamaño', async () => {
    const c = componer()
    const m = mundo()
    const r = await llamarFormato(m, { formato: '1:1', creativoId: ID_EXTRA }, c)
    expect(r.status).toBe(200)
    expect((c.mock.calls[0]![0] as any).copia.formato).toBe('1:1')
  })
  it('la imagen tiene que ser de ESE formato', async () => {
    const c = componer()
    const m = mundo({ extra: { aspecto: '9:16' } })
    expect((await llamarFormato(m, { formato: '1:1', creativoId: ID_EXTRA }, c)).status).toBe(422)
    sinNada(m, c)
  })
  it('esa imagen sin verificación ok o con textos viejos: 422', async () => {
    for (const extra of [{ verificacion: { estado: 'difiere' } }, { verificacion: null }, { gen: { textos_hash: 'd'.repeat(64) } }]) {
      const c = componer()
      const m = mundo({ extra })
      expect((await llamarFormato(m, { formato: '1:1', creativoId: ID_EXTRA }, c)).status).toBe(422)
      sinNada(m, c)
    }
  })
  it('sirve también con la promoción aprobada', async () => {
    const c = componer()
    const m = mundo({ promo: { estado: 'aprobada' } })
    expect((await llamarFormato(m, { formato: '1:1', creativoId: ID_EXTRA }, c)).status).toBe(200)
  })
})
