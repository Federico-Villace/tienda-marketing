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
  lugar: 'Quilmes',
}
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
const pedido = (o: Partial<Parameters<typeof componerPlaca>[0]> = {}) => ({
  escenaBytes: escenaDePrueba(),
  mime: MIME_ESCENA_PRUEBA,
  textos,
  plantilla: 'oferta_abajo' as const,
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
