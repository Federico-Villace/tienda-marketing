import { describe, it, expect, vi, afterEach } from 'vitest'
import { postEstimacionTanda, postEstimacionLote, postConfirmarLote, postEjecutar, postLiberarLote, deleteFoto, patchCreativo, postConfirmar, postEstimacion, postEstimacionFoto, postEstimacionPromocion, postFoto, postFotoConProgreso } from './api'

afterEach(() => vi.unstubAllGlobals())
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })

describe('postEstimacion', () => {
  it('manda solo piezaId, motor y cantidad y devuelve la estimación del servidor', async () => {
    const f = vi.fn(async () => json({ generacion: { id: 'g1', costoEstimadoUsd: 0.13 }, mes: { gastadoUsd: 1, topeUsd: 10 }, excedeTope: false }, 201))
    vi.stubGlobal('fetch', f)
    const r = await postEstimacion({ piezaId: 'p1', motor: 'gemini-nano-banana-2.1', cantidad: 3 })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/generaciones')
    expect(JSON.parse(String(init.body))).toEqual({ piezaId: 'p1', motor: 'gemini-nano-banana-2.1', cantidad: 3 })
    expect(r).toMatchObject({ ok: true, mes: { topeUsd: 10 }, excedeTope: false })
  })

  it('devuelve el error del servidor y nunca lanza ante un corte de red', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Productor apagado' }, 503)))
    expect(await postEstimacion({ piezaId: 'p', motor: 'm', cantidad: 1 })).toEqual({ ok: false, status: 503, error: 'Productor apagado' })
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('red'))))
    expect(await postEstimacion({ piezaId: 'p', motor: 'm', cantidad: 1 })).toMatchObject({ ok: false, status: 0 })
  })
})

describe('postConfirmar', () => {
  it('hace POST sin body al endpoint de la generación', async () => {
    const f = vi.fn(async () => json({ generacion: { id: 'g1', estado: 'ok', costoRealUsd: 0.1 }, creativos: [] }))
    vi.stubGlobal('fetch', f)
    const r = await postConfirmar('g1')
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/generaciones/g1/confirmar')
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
    expect(r).toMatchObject({ ok: true, generacion: { estado: 'ok' } })
  })

  it('en 402 trae el tope, lo gastado y lo que queda', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Supera el tope mensual.', topeUsd: 10, gastadoUsd: 9.95, restanteUsd: 0.05 }, 402)))
    expect(await postConfirmar('g1')).toEqual({ ok: false, status: 402, error: 'Supera el tope mensual.', restanteUsd: 0.05, topeUsd: 10 })
  })

  it('nunca lanza', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('red'))))
    expect(await postConfirmar('g1')).toMatchObject({ ok: false, status: 0 })
  })
})

describe('patchCreativo', () => {
  it('manda elegida y devuelve el creativo', async () => {
    const f = vi.fn(async () => json({ creativo: { id: 'c1', elegida: true } }))
    vi.stubGlobal('fetch', f)
    const r = await patchCreativo('c1', true)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/creativos/c1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toEqual({ elegida: true })
    expect(r).toEqual({ ok: true, creativo: { id: 'c1', elegida: true } })
  })

  it('error y red caída no lanzan', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'No' }, 403)))
    expect(await patchCreativo('c1', true)).toEqual({ ok: false, status: 403, error: 'No' })
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('red'))))
    expect(await patchCreativo('c1', true)).toMatchObject({ ok: false, status: 0 })
  })
})

describe('postFoto (F13)', () => {
  const formulario = () => {
    const fd = new FormData()
    fd.set('foto', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), 'foto.jpg')
    fd.set('derechos', 'acepto')
    return fd
  }

  it('hace POST multipart a /api/fotos SIN fijar content-type (lo arma el navegador con el boundary)', async () => {
    const f = vi.fn(async () => json({ foto: { id: 'f1', ancho: 1536, alto: 2048, url: 'https://x/f1.jpg' } }, 201))
    vi.stubGlobal('fetch', f)
    const fd = formulario()
    const r = await postFoto(fd)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/fotos')
    expect(init.method).toBe('POST')
    expect(init.body).toBe(fd)
    expect(init.headers).toBeUndefined()
    expect(r).toEqual({ ok: true, foto: { id: 'f1', ancho: 1536, alto: 2048, url: 'https://x/f1.jpg' } })
  })

  it.each([413, 415, 422])('el %s trae el mensaje del servidor y el status', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Mensaje del servidor' }, status)))
    expect(await postFoto(formulario())).toEqual({ ok: false, status, error: 'Mensaje del servidor' })
  })

  it('un cuerpo que no es JSON (p. ej. el 413 de Vercel) igual da un error legible', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Request Entity Too Large', { status: 413 })))
    const r = await postFoto(formulario())
    expect(r).toMatchObject({ ok: false, status: 413 })
    if (!r.ok) expect(r.error).toMatch(/pesa demasiado/i)
  })

  it('nunca lanza ante un corte de red', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('red'))))
    expect(await postFoto(formulario())).toMatchObject({ ok: false, status: 0 })
  })
})

describe('deleteFoto (F13)', () => {
  it('hace DELETE a /api/fotos/[id] y devuelve pendiente', async () => {
    const f = vi.fn(async () => json({ ok: true, pendiente: true }))
    vi.stubGlobal('fetch', f)
    const r = await deleteFoto('f1')
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/fotos/f1')
    expect(init.method).toBe('DELETE')
    expect(r).toEqual({ ok: true, pendiente: true })
  })

  it('error y red caída no lanzan', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'No' }, 403)))
    expect(await deleteFoto('f1')).toEqual({ ok: false, status: 403, error: 'No' })
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('red'))))
    expect(await deleteFoto('f1')).toMatchObject({ ok: false, status: 0 })
  })
})

describe('postEstimacionFoto (F13)', () => {
  it('manda solo fotoId, edicion, aspecto, motor y cantidad, nunca un precio', async () => {
    const f = vi.fn(async () => json({ generacion: { id: 'g1', costoEstimadoUsd: 0.09 }, mes: { gastadoUsd: 1, topeUsd: 10 }, excedeTope: false }, 201))
    vi.stubGlobal('fetch', f)
    const r = await postEstimacionFoto({ fotoId: 'f1', edicion: 'fondo_estudio', aspecto: '4:5', motor: 'gemini-nano-banana-2.1', cantidad: 2 })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/generaciones')
    expect(JSON.parse(String(init.body))).toEqual({ fotoId: 'f1', edicion: 'fondo_estudio', aspecto: '4:5', motor: 'gemini-nano-banana-2.1', cantidad: 2 })
    expect(r).toMatchObject({ ok: true, mes: { topeUsd: 10 } })
  })

  it('devuelve el error del servidor (410 foto borrada) y nunca lanza', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'La foto se borró.' }, 410)))
    expect(await postEstimacionFoto({ fotoId: 'f', edicion: 'solo_formato', aspecto: '1:1', motor: 'm', cantidad: 1 })).toEqual({ ok: false, status: 410, error: 'La foto se borró.' })
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('red'))))
    expect(await postEstimacionFoto({ fotoId: 'f', edicion: 'solo_formato', aspecto: '1:1', motor: 'm', cantidad: 1 })).toMatchObject({ ok: false, status: 0 })
  })
})

describe('postEstimacionPromocion', () => {
  it('manda solo la promoción, el motor y la cantidad: ni formato ni precio', async () => {
    const f = vi.fn(async () => json({ generacion: { id: 'g1', origen: 'promocion' }, mes: { gastadoUsd: 0, topeUsd: 10 }, excedeTope: false }, 201))
    vi.stubGlobal('fetch', f)
    const r = await postEstimacionPromocion({ promocionId: 'p1', motor: 'gemini-nano-banana-2.1', cantidad: 2 })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/generaciones')
    expect(JSON.parse(String(init.body))).toEqual({ promocionId: 'p1', motor: 'gemini-nano-banana-2.1', cantidad: 2 })
    expect(r).toMatchObject({ ok: true, excedeTope: false })
  })
  it('un 422 ("Elegí un diseño primero.") sale tal cual', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Elegí un diseño primero.' }, 422)))
    expect(await postEstimacionPromocion({ promocionId: 'p1', motor: 'm', cantidad: 1 })).toEqual({ ok: false, status: 422, error: 'Elegí un diseño primero.' })
  })
})

describe('postEstimacionTanda', () => {
  it('manda solo la tanda, el motor y la cantidad: ni foto ni formato ni precio', async () => {
    const f = vi.fn(async () => json({ generacion: { id: 'g1', origen: 'tanda', promociones: 3 }, mes: { gastadoUsd: 0, topeUsd: 10 }, excedeTope: false }, 201))
    vi.stubGlobal('fetch', f)
    const r = await postEstimacionTanda({ tandaId: 't1', motor: 'm', cantidad: 2 })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/generaciones')
    expect(JSON.parse(String(init.body))).toEqual({ tandaId: 't1', motor: 'm', cantidad: 2 })
    expect(r).toMatchObject({ ok: true })
  })
  it('un 422 sale tal cual', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'no piden la misma imagen' }, 422)))
    expect(await postEstimacionTanda({ tandaId: 't1', motor: 'm', cantidad: 1 })).toEqual({ ok: false, status: 422, error: 'no piden la misma imagen' })
  })
})

describe('compuerta de lote (ADR-032)', () => {
  const lote = { id: 'L1', costoEstimadoUsd: 0.225, items: [{ generacionId: 'g1', grupo: 1, modelo: 'TRK', costoEstimadoUsd: 0.045 }], venceEn: '2026-10-28T15:15:00Z' }

  it('postEstimacionLote manda solo tanda, variantes, motor y grupos (nunca precio) y devuelve el lote', async () => {
    const f = vi.fn(async () => json({ lote, mes: { gastadoUsd: 1, topeUsd: 10 }, excedeTope: false }, 201))
    vi.stubGlobal('fetch', f)
    const r = await postEstimacionLote({ tandaId: 'T1', variantes: 1, motor: 'gemini-nano-banana-2.1', grupos: [2, 3] })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/generaciones/lote')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ tandaId: 'T1', variantes: 1, motor: 'gemini-nano-banana-2.1', grupos: [2, 3] })
    expect(r).toEqual({ ok: true, lote, mes: { gastadoUsd: 1, topeUsd: 10 }, excedeTope: false })
  })
  it('sin grupos no manda la clave', async () => {
    const f = vi.fn(async () => json({ lote, mes: { gastadoUsd: 0, topeUsd: 10 } }, 201))
    vi.stubGlobal('fetch', f)
    await postEstimacionLote({ tandaId: 'T1', variantes: 2, motor: 'm' })
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ tandaId: 'T1', variantes: 2, motor: 'm' })
  })
  it('un 422 por moto trae el error en castellano y nunca lanza ante un corte de red', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Moto 2 (Leoncino): Elegí un diseño primero.', grupo: 2 }, 422)))
    expect(await postEstimacionLote({ tandaId: 'T', variantes: 1, motor: 'm' })).toEqual({ ok: false, status: 422, error: 'Moto 2 (Leoncino): Elegí un diseño primero.' })
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('red'))))
    expect(await postEstimacionLote({ tandaId: 'T', variantes: 1, motor: 'm' })).toMatchObject({ ok: false, status: 0 })
  })

  it('postConfirmarLote: POST sin body y devuelve las imágenes confirmadas', async () => {
    const f = vi.fn(async () => json({ lote: { id: 'L1', estado: 'confirmado', costoEstimadoUsd: 0.225 }, items: [{ generacionId: 'g1', grupo: 1 }] }))
    vi.stubGlobal('fetch', f)
    const r = await postConfirmarLote('L1')
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/generaciones/lote/L1/confirmar')
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
    expect(r).toEqual({ ok: true, items: [{ generacionId: 'g1', grupo: 1 }] })
  })
  it('postConfirmarLote en 402 trae lo que queda del mes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Supera el tope mensual.', topeUsd: 10, gastadoUsd: 9.9, restanteUsd: 0.1, estimadoUsd: 0.2 }, 402)))
    expect(await postConfirmarLote('L1')).toEqual({ ok: false, status: 402, error: 'Supera el tope mensual.', restanteUsd: 0.1, topeUsd: 10 })
  })

  it('postEjecutar: POST al ítem y devuelve el cierre con las imágenes; nunca lanza', async () => {
    const f = vi.fn(async () => json({ generacion: { id: 'g1', estado: 'ok', costoRealUsd: 0.04, costoEstimadoUsd: 0.045, error: null }, creativos: [{ id: 'c1', orden: 1, url: 'u' }] }))
    vi.stubGlobal('fetch', f)
    const r = await postEjecutar('g1')
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe('/api/generaciones/g1/ejecutar')
    expect(r).toMatchObject({ ok: true, generacion: { estado: 'ok' }, creativos: [{ id: 'c1' }] })
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Ya se está generando o ya terminó.' }, 409)))
    expect(await postEjecutar('g1')).toEqual({ ok: false, status: 409, error: 'Ya se está generando o ya terminó.' })
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('red'))))
    expect(await postEjecutar('g1')).toMatchObject({ ok: false, status: 0 })
  })

  it('postLiberarLote: POST y cuántas liberó', async () => {
    const f = vi.fn(async () => json({ liberadas: 3 }))
    vi.stubGlobal('fetch', f)
    expect(await postLiberarLote('L1')).toEqual({ ok: true, liberadas: 3 })
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe('/api/generaciones/lote/L1/liberar')
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('red'))))
    expect(await postLiberarLote('L1')).toMatchObject({ ok: false, status: 0 })
  })
})

describe('postFotoConProgreso (subida con barra de avance)', () => {
  type Evento = { lengthComputable: boolean; loaded: number; total: number }
  class XhrFalso {
    metodo = ''
    url = ''
    cuerpo: unknown = null
    status = 0
    responseText = ''
    upload: { onprogress: ((e: Evento) => void) | null } = { onprogress: null }
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    ontimeout: (() => void) | null = null
    onabort: (() => void) | null = null
    open(m: string, u: string) {
      this.metodo = m
      this.url = u
    }
    send(c: unknown) {
      this.cuerpo = c
    }
    responder(status: number, texto: string) {
      this.status = status
      this.responseText = texto
      this.onload?.()
    }
  }
  const formulario = () => {
    const fd = new FormData()
    fd.set('foto', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), 'foto.jpg')
    return fd
  }
  const armar = () => {
    const x = new XhrFalso()
    const alProgreso = vi.fn()
    const fd = formulario()
    const promesa = postFotoConProgreso(fd, alProgreso, { crearXhr: () => x as never })
    return { x, alProgreso, fd, promesa }
  }

  it('hace POST multipart a /api/fotos con el mismo formulario y avisa el avance en porcentaje', async () => {
    const { x, alProgreso, fd, promesa } = armar()
    expect(x.metodo).toBe('POST')
    expect(x.url).toBe('/api/fotos')
    expect(x.cuerpo).toBe(fd)
    x.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 })
    x.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 3 })
    x.upload.onprogress?.({ lengthComputable: false, loaded: 5, total: 0 })
    x.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 })
    x.responder(201, JSON.stringify({ foto: { id: 'f1', ancho: 1, alto: 1, url: 'u' } }))
    expect(await promesa).toEqual({ ok: true, foto: { id: 'f1', ancho: 1, alto: 1, url: 'u' } })
    expect(alProgreso.mock.calls.map((c) => c[0])).toEqual([25, 33, 100])
  })

  it('el error del servidor llega con su mensaje y su status', async () => {
    const { x, promesa } = armar()
    x.responder(422, JSON.stringify({ error: 'Mensaje del servidor' }))
    expect(await promesa).toEqual({ ok: false, status: 422, error: 'Mensaje del servidor' })
  })

  it('un 413 que no es JSON (Vercel) da un mensaje legible', async () => {
    const { x, promesa } = armar()
    x.responder(413, 'Request Entity Too Large')
    const r = await promesa
    expect(r).toMatchObject({ ok: false, status: 413 })
    if (!r.ok) expect(r.error).toMatch(/pesa demasiado/i)
  })

  it('un corte de red no lanza: dice que revise la conexión', async () => {
    const { x, promesa } = armar()
    x.onerror?.()
    const r = await promesa
    expect(r).toMatchObject({ ok: false, status: 0 })
    if (!r.ok) expect(r.error).toMatch(/conexión/)
  })

  it('un corte por tiempo tampoco lanza', async () => {
    const { x, promesa } = armar()
    x.ontimeout?.()
    expect(await promesa).toMatchObject({ ok: false, status: 0 })
  })

  it('si el navegador no puede armar el pedido, no lanza', async () => {
    const r = await postFotoConProgreso(formulario(), () => {}, {
      crearXhr: () => {
        throw new Error('sin XHR')
      },
    })
    expect(r).toMatchObject({ ok: false, status: 0 })
  })
})
