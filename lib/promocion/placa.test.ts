import { describe, it, expect, vi, afterEach } from 'vitest'
import { hashPlaca, manejarPlaca, textosDePlaca } from './placa'
import { HEADER_USUARIO } from '../auth/acceso'
import { MARCAS } from '../datos/marcas'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { copyDePrueba, filaPromocion, ID_ESCENA, ID_FOTO, ID_PROMO } from './fixture'
import { ErrorTextoLargo } from './plantillas'

const entorno = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_xyz', GEMINI_API_KEY: 'AIza-X', OPENAI_API_KEY: 'sk-X' }
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 9, 9, 9])
const ESCENA = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const RUTA_ESCENA = `${ORGANIZACION_PILOTO_ID}/gen-1/1.jpg`

const completa = (o: Record<string, unknown> = {}) =>
  filaPromocion({
    id: ID_PROMO,
    marca_id: MARCAS[3]!.id,
    foto_id: ID_FOTO,
    revision: 4,
    plantilla: 'oferta_abajo',
    fondo: 'fondo_estudio',
    copy: copyDePrueba(),
    titular: 'Tu próxima aventura',
    escena_creativo_id: ID_ESCENA,
    ...o,
  } as never)

const pedido = (cuerpo: unknown = { revision: 4 }, usuario: string | null = 'u-1') =>
  new Request(`https://app.ejemplo.com/api/promociones/${ID_PROMO}/placa`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(usuario ? { [HEADER_USUARIO]: usuario } : {}) },
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  })

type Mundo = {
  rol?: string | null
  promo?: Record<string, unknown> | null
  escena?: 'ok' | 'ajena' | 'sin_imagen' | 'inexistente' | 'de_tanda' | 'de_otra_tanda'
  subida?: () => Response
  firma?: 'ok' | 'falla'
  rpc?: (a: any) => Response
}
function mundo(o: Mundo = {}) {
  const subidas: { ruta: string; mime: string; bytes: Uint8Array }[] = []
  const descargas: string[] = []
  const rpcs: any[] = []
  const firmas: any[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    if (url.hostname !== 'abc.supabase.co') throw new Error(`no se llama a ${url.hostname}`)
    const p = url.pathname
    if (p === '/rest/v1/miembros') return json(o.rol === null ? [] : [{ rol: o.rol ?? 'director' }])
    if (p === '/rest/v1/promociones') return json(o.promo === null ? [] : [completa(o.promo ?? {})])
    if (p === '/rest/v1/creativos') {
      if (o.escena === 'inexistente') return json([])
      return json([{ id: ID_ESCENA, ruta: o.escena === 'sin_imagen' ? null : RUTA_ESCENA, mime_type: 'image/jpeg', generaciones: o.escena === 'de_tanda' ? { promocion_id: null, tanda_id: 'T1' } : o.escena === 'de_otra_tanda' ? { promocion_id: null, tanda_id: 'T2' } : { promocion_id: o.escena === 'ajena' ? 'otra' : ID_PROMO, tanda_id: null } }])
    }
    if (p.startsWith('/storage/v1/object/authenticated/creativos/')) {
      descargas.push(p.replace('/storage/v1/object/authenticated/creativos/', ''))
      return new Response(ESCENA)
    }
    if (p === '/storage/v1/object/sign/creativos') {
      const body = JSON.parse(String(init?.body))
      firmas.push(body)
      if (o.firma === 'falla') return json({ message: 'no' }, 500)
      return json(body.paths.map((x: string) => ({ path: x, signedURL: `/object/sign/creativos/${x}?token=T`, error: null })))
    }
    if (p.startsWith('/storage/v1/object/creativos/')) {
      if (o.subida) return o.subida()
      subidas.push({ ruta: p.replace('/storage/v1/object/creativos/', ''), mime: (init!.headers as Record<string, string>)['content-type']!, bytes: init!.body as Uint8Array })
      return json({ Key: 'x' })
    }
    if (p === '/rest/v1/rpc/editar_promocion') {
      const a = JSON.parse(String(init?.body))
      rpcs.push(a)
      return (o.rpc ?? ((x) => json(completa({ revision: x.p_revision + 1, placa_ruta: x.p_campos.placa_ruta, placa_hash: x.p_campos.placa_hash }))))(a)
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, subidas, descargas, rpcs, firmas }
}
const componer = () => vi.fn(async (_p: unknown) => PNG)
const llamar = (m: ReturnType<typeof mundo>, cuerpo: unknown = { revision: 4 }, c = componer(), id = ID_PROMO, usuario: string | null = 'u-1') =>
  manejarPlaca(pedido(cuerpo, usuario), id, entorno, m.f, c)

afterEach(() => vi.restoreAllMocks())

describe('acceso y forma', () => {
  it('sin sesión 401 y lector 403, sin componer ni subir', async () => {
    const c = componer()
    const m = mundo()
    expect((await llamar(m, { revision: 4 }, c, ID_PROMO, null)).status).toBe(401)
    const m2 = mundo({ rol: 'lector' })
    expect((await llamar(m2, { revision: 4 }, c)).status).toBe(403)
    expect(c).not.toHaveBeenCalled()
    expect(m2.subidas).toHaveLength(0)
  })
  it('id inválido o inexistente 404; body sin revisión 400', async () => {
    expect((await llamar(mundo(), { revision: 4 }, componer(), 'abc')).status).toBe(404)
    expect((await llamar(mundo({ promo: null }))).status).toBe(404)
    for (const c of [{}, { revision: 0 }, 'no json']) expect((await llamar(mundo(), c)).status).toBe(400)
  })
  it('una revisión vieja o una promoción que ya no es borrador es 409', async () => {
    expect((await llamar(mundo({ promo: { revision: 7 } }))).status).toBe(409)
    expect((await llamar(mundo({ promo: { estado: 'aprobada' } }))).status).toBe(409)
  })
})

describe('lo que falta (422)', () => {
  it.each([
    ['la imagen', { escena_creativo_id: null }, /imagen/],
    ['el diseño', { plantilla: null }, /diseño/],
    ['el texto', { copy: null, titular: null }, /texto/],
  ])('sin %s', async (_n, falta, patron) => {
    const c = componer()
    const m = mundo({ promo: falta })
    const r = await llamar(m, { revision: 4 }, c)
    expect(r.status).toBe(422)
    expect(((await r.json()) as any).error).toMatch(patron)
    expect(c).not.toHaveBeenCalled()
    expect(m.subidas).toHaveLength(0)
  })
  it('si faltan varias cosas las dice todas', async () => {
    const r = await llamar(mundo({ promo: { escena_creativo_id: null, plantilla: null, copy: null, titular: null } }))
    const e = ((await r.json()) as any).error as string
    expect(e).toMatch(/imagen/)
    expect(e).toMatch(/diseño/)
    expect(e).toMatch(/texto/)
  })
  it('una escena de otra promoción, sin imagen o inexistente es 422', async () => {
    for (const escena of ['ajena', 'sin_imagen', 'inexistente'] as const) {
      expect((await llamar(mundo({ escena }))).status, escena).toBe(422)
    }
  })
  it('la escena compartida de la tanda de la hija se compone; la de otra tanda es 422', async () => {
    const c = componer()
    const buena = mundo({ escena: 'de_tanda', promo: { tanda_id: 'T1' } })
    expect((await llamar(buena, { revision: 4 }, c)).status).toBe(200)
    expect(c).toHaveBeenCalledTimes(1)
    expect((await llamar(mundo({ escena: 'de_otra_tanda', promo: { tanda_id: 'T1' } }))).status).toBe(422)
    expect((await llamar(mundo({ escena: 'de_tanda', promo: { tanda_id: null } }))).status).toBe(422)
  })
  it('un texto que no entra en el diseño es 422 con el mensaje de la plantilla', async () => {
    const c = vi.fn(async () => {
      throw new ErrorTextoLargo('modelo')
    })
    const m = mundo()
    const r = await llamar(m, { revision: 4 }, c as never)
    expect(r.status).toBe(422)
    expect(((await r.json()) as any).error).toBe('El texto del modelo es muy largo para este diseño.')
    expect(m.subidas).toHaveLength(0)
  })
})

describe('componer, subir y guardar', () => {
  it('descarga la escena, compone con el precio EXACTO del dato, sube el PNG y deja la placa en la promoción', async () => {
    const c = componer()
    const m = mundo()
    const r = await llamar(m, { revision: 4 }, c)
    expect(r.status).toBe(200)
    expect(m.descargas).toEqual([RUTA_ESCENA])
    expect(c).toHaveBeenCalledTimes(1)
    const pedidoComponer = c.mock.calls[0]![0] as any
    expect(Array.from(pedidoComponer.escenaBytes)).toEqual(Array.from(ESCENA))
    expect(pedidoComponer).toMatchObject({ mime: 'image/jpeg', plantilla: 'oferta_abajo', posicionMoto: 'centro', aspecto: '4:5' })
    expect(pedidoComponer.textos).toEqual({
      marca: MARCAS[3]!.nombre,
      modelo: 'TRK 502',
      precio: '$ 4.500.000',
      promo: '12 cuotas sin interés',
      titular: 'Tu próxima aventura',
      extra: '',
      lugar: 'Quilmes',
    })
    expect(m.subidas).toHaveLength(1)
    expect(m.subidas[0]!.mime).toBe('image/png')
    expect(m.subidas[0]!.ruta).toMatch(new RegExp(`^${ORGANIZACION_PILOTO_ID}/promociones/${ID_PROMO}/[0-9a-f]{12}\\.png$`))
    expect(Array.from(m.subidas[0]!.bytes)).toEqual(Array.from(PNG))
    expect(m.rpcs).toEqual([{ p_id: ID_PROMO, p_revision: 4, p_campos: { placa_ruta: m.subidas[0]!.ruta, placa_hash: expect.stringMatching(/^[0-9a-f]{64}$/) }, p_usuario: 'u-1' }])
    const b = (await r.json()) as any
    expect(b.url).toContain(`/object/sign/creativos/${m.subidas[0]!.ruta}`)
    expect(b.url).not.toContain('download')
    expect(b.promocion.placaLista).toBe(true)
    expect(b.promocion.revision).toBe(5)
    expect(b.reutilizada).toBe(false)
    expect(JSON.stringify(b.promocion)).not.toContain(ORGANIZACION_PILOTO_ID)
  })

  it('el titular editado en el paso 4 gana sobre el del texto elegido', async () => {
    const c = componer()
    await llamar(mundo({ promo: { titular: 'Mi titular' } }), { revision: 4 }, c)
    expect((c.mock.calls[0]![0] as any).textos.titular).toBe('Mi titular')
  })

  it('una promoción sin detalle muestra la etiqueta del tipo y "ninguna" sin nada', async () => {
    const c = componer()
    await llamar(mundo({ promo: { datos: { precio: { moneda: 'USD', monto: 5990 }, promo: { tipo: 'contado', detalle: '' }, lugar: 'Bernal', indicaciones: '' } } }), { revision: 4 }, c)
    expect((c.mock.calls[0]![0] as any).textos).toMatchObject({ precio: 'US$ 5.990', promo: 'Contado', lugar: 'Bernal' })
    const c2 = componer()
    await llamar(mundo({ promo: { datos: { precio: { moneda: 'ARS', monto: 1000 }, promo: { tipo: 'ninguna', detalle: '' }, lugar: 'Quilmes', indicaciones: '' } } }), { revision: 4 }, c2)
    expect((c2.mock.calls[0]![0] as any).textos.promo).toBe('')
  })

  it('reusa por hash: si no cambió nada no descarga, no compone ni sube; solo firma', async () => {
    const promo = completa()
    const { hash } = hashPlaca(promo)
    const c = componer()
    const m = mundo({ promo: { placa_hash: hash, placa_ruta: `${ORGANIZACION_PILOTO_ID}/promociones/${ID_PROMO}/${hash.slice(0, 12)}.png` } })
    const r = await llamar(m, { revision: 4 }, c)
    expect(r.status).toBe(200)
    expect(((await r.json()) as any).reutilizada).toBe(true)
    expect(c).not.toHaveBeenCalled()
    expect(m.descargas).toHaveLength(0)
    expect(m.subidas).toHaveLength(0)
    expect(m.rpcs).toHaveLength(0)
    expect(m.firmas).toHaveLength(1)
  })

  it('cambia el hash si cambia cualquier cosa que se dibuja', () => {
    const base = hashPlaca(completa()).hash
    expect(hashPlaca(completa({ plantilla: 'catalogo' })).hash).not.toBe(base)
    expect(hashPlaca(completa({ aspecto: '9:16' })).hash).not.toBe(base)
    expect(hashPlaca(completa({ modelo: 'Leoncino' })).hash).not.toBe(base)
    expect(hashPlaca(completa({ titular: 'Otro' })).hash).not.toBe(base)
    expect(hashPlaca(completa({ escena_creativo_id: 'otra' })).hash).not.toBe(base)
    expect(hashPlaca(completa({ datos: { precio: { moneda: 'ARS', monto: 4_500_001 }, promo: { tipo: 'cuotas', detalle: '12 cuotas sin interés' }, lugar: 'Quilmes', indicaciones: '' } })).hash).not.toBe(base)
  })
  it('la línea extra y el lado del texto (al costado) también cambian el hash', () => {
    const base = hashPlaca(completa()).hash
    expect(hashPlaca(completa({ linea_extra: 'Hot Sale' })).hash).not.toBe(base)
    const costado = completa({ plantilla: 'oferta_costado', posicion_moto: 'izquierda' })
    expect(hashPlaca(completa({ plantilla: 'oferta_costado', posicion_moto: 'derecha' })).hash).not.toBe(hashPlaca(costado).hash)
  })
  it('arriba y abajo la moto no cambia lo que se dibuja: mismo hash', () => {
    expect(hashPlaca(completa({ posicion_moto: 'izquierda' })).hash).toBe(hashPlaca(completa({ posicion_moto: 'derecha' })).hash)
  })
  it('la línea extra y la posición de la moto llegan al compositor; el texto del lado opuesto lo decide la moto', async () => {
    const c = componer()
    await llamar(mundo({ promo: { linea_extra: ' Hot Sale · Solo este fin de semana ', plantilla: 'oferta_costado', posicion_moto: 'derecha' } }), { revision: 4 }, c)
    expect(c.mock.calls[0]![0]).toMatchObject({ plantilla: 'oferta_costado', posicionMoto: 'derecha', textos: { extra: 'Hot Sale · Solo este fin de semana' } })
  })
  it('la versión de la placa subió (v2): una placa vieja nunca se reusa', async () => {
    const { VERSION_PLACA } = await import('./placa')
    expect(VERSION_PLACA).toBe('placa-v2')
  })
  it('NO cambia con lo que no se dibuja (indicaciones, copy, revisión, descripción del fondo)', () => {
    const base = hashPlaca(completa()).hash
    expect(hashPlaca(completa({ fondo_descripcion: 'de noche' })).hash).toBe(base)
    expect(hashPlaca(completa({ inspiracion_foto_id: 'x' })).hash).toBe(base)
    expect(hashPlaca(completa({ revision: 9 })).hash).toBe(base)
    expect(hashPlaca(completa({ copy: copyDePrueba({ copy: 'otro texto' }) })).hash).toBe(base)
    expect(textosDePlaca(completa()).modelo).toBe('TRK 502')
  })

  it('si el archivo ya existe en Storage (409) se sigue: es el mismo contenido', async () => {
    for (const respuesta of [() => json({ message: 'exists' }, 409), () => json({ statusCode: '409', error: 'Duplicate', message: 'The resource already exists' }, 400)]) {
      const m = mundo({ subida: respuesta })
      const r = await llamar(m)
      expect(r.status).toBe(200)
      expect(m.rpcs).toHaveLength(1)
    }
  })

  it('otro fallo de Storage es 500 sin filtrar detalles ni la clave', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = mundo({ subida: () => json({ message: 'boom sb_secret_xyz' }, 500) })
    const r = await llamar(m)
    expect(r.status).toBe(500)
    const t = await r.text()
    expect(t).not.toContain('boom')
    expect(t).not.toContain('sb_secret')
    expect(m.rpcs).toHaveLength(0)
  })

  it('si la promoción cambió mientras se componía (PT409) es 409', async () => {
    const m = mundo({ rpc: () => json({ message: 'cambió' }, 409) })
    expect((await llamar(m)).status).toBe(409)
  })

  it('si no se puede firmar la URL la placa queda guardada y la respuesta lo dice sin URL', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await llamar(mundo({ firma: 'falla' }))
    expect(r.status).toBe(200)
    expect(((await r.json()) as any).url).toBeNull()
  })

  it('no llama a Gemini ni a OpenAI: la placa es gratis', async () => {
    const m = mundo()
    await llamar(m)
    const hosts = m.f.mock.calls.map(([u]) => new URL(String(u)).hostname)
    expect(new Set(hosts)).toEqual(new Set(['abc.supabase.co']))
  })
})
