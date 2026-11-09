import { describe, it, expect } from 'vitest'
import { HEADER_USUARIO } from '../auth/acceso'
import { idsDeRecursos, manejarRecurso } from './recursos-placa'

const pedido = (conSesion = true) => new Request('https://app.ejemplo.com/api/placa-recursos/x', { headers: conSesion ? { [HEADER_USUARIO]: 'u1' } : {} })

describe('idsDeRecursos', () => {
  it('incluye el logo 999, las texturas y cada logo del manifiesto, sin extensión', () => {
    const ids = Object.keys(idsDeRecursos())
    expect(ids).toEqual(expect.arrayContaining(['logo999', 'textura-grunge', 'textura-raspado', '1322217014300342_vespa', '100206789578448_suzuki']))
    for (const id of ids) expect(id).not.toMatch(/[./\\]/)
  })
})

describe('GET /api/placa-recursos/[id]', () => {
  it('sin sesión → 401', async () => {
    expect((await manejarRecurso(pedido(false), 'logo999')).status).toBe(401)
  })

  it('id desconocido → 404', async () => {
    expect((await manejarRecurso(pedido(), 'no-existe')).status).toBe(404)
  })

  it('no hay path traversal: solo ids del manifiesto', async () => {
    for (const id of ['../../.env.local', '..%2F..%2Fpackage.json', 'manifiesto.json', '999motos/999motos.png', '/etc/passwd']) {
      expect((await manejarRecurso(pedido(), id)).status, id).toBe(404)
    }
  })

  it('sirve el logo 999 con su content-type por magic bytes y cache privado', async () => {
    const r = await manejarRecurso(pedido(), 'logo999')
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toBe('image/png')
    expect(r.headers.get('cache-control')).toMatch(/private/)
    expect(r.headers.get('cache-control')).toMatch(/max-age=3600/)
    expect((await r.arrayBuffer()).byteLength).toBeGreaterThan(1000)
  })

  it('el content-type sale de los bytes: webp y jpeg', async () => {
    expect((await manejarRecurso(pedido(), '1838303613073060_benelli')).headers.get('content-type')).toBe('image/webp')
    expect((await manejarRecurso(pedido(), '1322217014300342_vespa')).headers.get('content-type')).toBe('image/jpeg')
  })

  it('sirve las texturas', async () => {
    expect((await manejarRecurso(pedido(), 'textura-grunge')).headers.get('content-type')).toBe('image/png')
  })
})
