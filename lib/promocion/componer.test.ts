import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { componerPlaca, type Render } from './componer'
import { ErrorTextoLargo, type TextosPlaca } from './plantillas'
import { escenaDePrueba, MIME_ESCENA_PRUEBA } from './escena-fixture'

const textos: TextosPlaca = {
  marca: 'Benelli Store Quilmes',
  modelo: 'TRK 502',
  precio: '$ 4.500.000',
  promo: '12 cuotas sin interés',
  titular: 'Tu próxima aventura',
  extra: 'Hot Sale · Solo este fin de semana',
  lugar: 'Quilmes',
}
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
const pedido = (o: Partial<Parameters<typeof componerPlaca>[0]> = {}) => ({
  escenaBytes: escenaDePrueba(),
  mime: MIME_ESCENA_PRUEBA,
  textos,
  plantilla: 'oferta_abajo' as const,
  posicionMoto: 'centro' as const,
  aspecto: '4:5' as const,
  ...o,
})

describe('componerPlaca (con el render inyectado)', () => {
  it('le pide al render un cuadro de 1080 de ancho y el alto del formato, y devuelve sus bytes', async () => {
    const render = vi.fn<Render>(async () => PNG)
    const r = await componerPlaca(pedido({ aspecto: '9:16' }), render)
    expect(r).toBe(PNG)
    expect(render).toHaveBeenCalledTimes(1)
    expect(render.mock.calls[0]![1]).toEqual({ width: 1080, height: 1920 })
  })

  it('el árbol que se dibuja lleva el precio EXACTO y la escena como data URI', async () => {
    const render = vi.fn<Render>(async () => PNG)
    await componerPlaca(pedido(), render)
    const html = renderToStaticMarkup(render.mock.calls[0]![0])
    expect(html).toContain('$ 4.500.000')
    expect(html).toContain('TRK 502')
    expect(html).toContain('data:image/jpeg;base64,')
  })

  it('usa los nombres de familia que el render registra: Anton e Inter', async () => {
    const render = vi.fn<Render>(async () => PNG)
    await componerPlaca(pedido(), render)
    const html = renderToStaticMarkup(render.mock.calls[0]![0])
    expect(html).toMatch(/font-family:Anton/)
    expect(html).toMatch(/font-family:Inter/)
  })

  it('un texto que no entra falla ANTES de renderizar, con el campo y el mensaje en castellano', async () => {
    const render = vi.fn<Render>(async () => PNG)
    await expect(componerPlaca(pedido({ textos: { ...textos, modelo: 'm'.repeat(60) } }), render)).rejects.toThrow(ErrorTextoLargo)
    await expect(componerPlaca(pedido({ textos: { ...textos, modelo: 'm'.repeat(60) } }), render)).rejects.toThrow('El texto del modelo es muy largo para este diseño.')
    expect(render).not.toHaveBeenCalled()
  })

  it('si el render falla, el error sube', async () => {
    await expect(componerPlaca(pedido(), async () => { throw new Error('satori') })).rejects.toThrow('satori')
  })

  it('con la misma entrada arma el mismo árbol (determinístico)', async () => {
    const a = vi.fn<Render>(async () => PNG)
    const b = vi.fn<Render>(async () => PNG)
    await componerPlaca(pedido(), a)
    await componerPlaca(pedido(), b)
    expect(renderToStaticMarkup(a.mock.calls[0]![0])).toBe(renderToStaticMarkup(b.mock.calls[0]![0]))
  })
})

describe('componerPlaca · plantillas de diseño', () => {
  const datos = { precio: { moneda: 'ARS' as const, monto: 4_500_000 }, promo: { tipo: 'cuotas' as const, detalle: '12 cuotas sin interés' }, lugar: 'Quilmes', indicaciones: '' }
  const recursos = { logo999: 'data:image/png;base64,AA', logoConcesionaria: null, logoMarca: null, textura: 'data:image/png;base64,BB', raspado: 'data:image/png;base64,CC' }
  const enDiseno = (o: Partial<Parameters<typeof componerPlaca>[0]> = {}) => pedido({ plantilla: 'impactante_textura', datos, recursos, nombreConcesionaria: 'Benelli Store Quilmes', diseno: null, ...o })

  it('le pide al render las fuentes de ESA plantilla (y solo esas)', async () => {
    const render = vi.fn<Render>(async () => PNG)
    await componerPlaca(enDiseno(), render)
    expect(render.mock.calls[0]![2]).toEqual(['anton', 'kaushan', 'barlow-condensed'])
  })

  it('las clásicas siguen pidiendo Anton e Inter', async () => {
    const render = vi.fn<Render>(async () => PNG)
    await componerPlaca(pedido(), render)
    expect(render.mock.calls[0]![2]).toEqual(['anton', 'inter'])
  })

  it('el formato manda sobre el aspecto de la promoción: la misma escena sale en los tres tamaños', async () => {
    for (const [formato, alto] of [['1:1', 1080], ['4:5', 1350], ['9:16', 1920]] as const) {
      const render = vi.fn<Render>(async () => PNG)
      await componerPlaca(enDiseno({ formato, aspecto: '4:5' }), render)
      expect(render.mock.calls[0]![1]).toEqual({ width: 1080, height: alto })
    }
  })

  it('el árbol lleva el precio exacto, la escena como data URI y el nombre de la concesionaria si falta su logo', async () => {
    const render = vi.fn<Render>(async () => PNG)
    await componerPlaca(enDiseno(), render)
    const html = renderToStaticMarkup(render.mock.calls[0]![0])
    expect(html).toContain('$ 4.500.000')
    expect(html).toContain('data:image/jpeg;base64,')
    expect(html).toContain('Benelli Store Quilmes')
    expect(html).toMatch(/font-family:Kaushan Script/)
  })

  it('mostrarPrecio=false: sale CONSULTÁ PRECIO y el monto no está en el árbol', async () => {
    const render = vi.fn<Render>(async () => PNG)
    await componerPlaca(enDiseno({ diseno: { mostrarPrecio: false } }), render)
    const html = renderToStaticMarkup(render.mock.calls[0]![0])
    expect(html).toContain('CONSULTÁ PRECIO')
    expect(html).not.toContain('4.500.000')
  })

  it('un lugar que no entra falla antes de dibujar', async () => {
    const render = vi.fn<Render>(async () => PNG)
    await expect(componerPlaca(enDiseno({ textos: { ...textos, lugar: 'x'.repeat(200) } }), render)).rejects.toThrow(ErrorTextoLargo)
    expect(render).not.toHaveBeenCalled()
  })

  it('es determinista', async () => {
    const a = vi.fn<Render>(async () => PNG)
    const b = vi.fn<Render>(async () => PNG)
    await componerPlaca(enDiseno(), a)
    await componerPlaca(enDiseno(), b)
    expect(renderToStaticMarkup(a.mock.calls[0]![0])).toBe(renderToStaticMarkup(b.mock.calls[0]![0]))
  })

  it('una plantilla de diseño sin datos es un error de programación, no un PNG a medias', async () => {
    await expect(componerPlaca(pedido({ plantilla: 'impactante_textura' }), vi.fn<Render>(async () => PNG))).rejects.toThrow(/datos/)
  })
})
