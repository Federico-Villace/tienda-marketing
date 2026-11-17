import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { componerPlaca, type PedidoPlaca, type Render } from './componer'
import { ErrorTextoLargo, type TextosPlaca } from './plantillas'
import { escenaDePrueba, MIME_ESCENA_PRUEBA } from './escena-fixture'
import type { TextosGrilla } from './varias/grilla'

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
const textosPlaca: TextosPlaca = { marca: '', modelo: '', precio: '', promo: '', titular: '', extra: '', lugar: '' }
const textos = (n = 3, o: Partial<TextosGrilla> = {}): TextosGrilla => ({
  marca: 'Suzuki Quilmes',
  titular: 'Elegí la tuya',
  extra: 'Hot Sale',
  lugar: 'Quilmes',
  motos: [
    { modelo: 'ROUSER 200', precio: '$ 4.500.000', condicion: '12 cuotas sin interés' },
    { modelo: 'LEONCINO 500', precio: '$ 7.000.000', condicion: '' },
    { modelo: 'TRK 502', precio: '$ 9.200.000', condicion: 'Contado' },
    { modelo: 'GSX 150', precio: '$ 3.100.000', condicion: '' },
  ].slice(0, n),
  ...o,
})
const foto = () => ({ bytes: escenaDePrueba(), mime: MIME_ESCENA_PRUEBA })
const pedido = (n = 3, o: Partial<PedidoPlaca> = {}, t: Partial<TextosGrilla> = {}): PedidoPlaca => ({
  escenaBytes: new Uint8Array(0),
  mime: '',
  textos: textosPlaca,
  plantilla: 'varias_motos',
  posicionMoto: 'centro',
  aspecto: '4:5',
  grilla: { formato: '4:5', textos: textos(n, t), fotos: Array.from({ length: n }, foto), recursos: { logo999: 'data:image/png;base64,AAAA', logoConcesionaria: null, logoMarca: null, textura: null, raspado: null } },
  ...o,
})
const html = async (p: PedidoPlaca) => {
  const render = vi.fn<Render>(async () => PNG)
  await componerPlaca(p, render)
  return { render, html: renderToStaticMarkup(render.mock.calls[0]![0]) }
}

describe('componerPlaca · la grilla de motos (render inyectado)', () => {
  it('pide al render el tamaño del formato y devuelve sus bytes', async () => {
    for (const [formato, alto] of [['1:1', 1080], ['4:5', 1350], ['9:16', 1920]] as const) {
      const render = vi.fn<Render>(async () => PNG)
      const r = await componerPlaca(pedido(2, { grilla: { ...pedido(2).grilla!, formato } }), render)
      expect(r).toBe(PNG)
      expect(render.mock.calls[0]![1]).toEqual({ width: 1080, height: alto })
    }
  })
  it('el árbol lleva el modelo y el precio EXACTO de cada moto, y una foto por moto como data URI', async () => {
    const { html: h } = await html(pedido(3))
    for (const x of ['ROUSER 200', '$ 4.500.000', 'LEONCINO 500', '$ 7.000.000', 'TRK 502', '$ 9.200.000', '12 cuotas sin interés', 'Contado', 'Elegí la tuya', 'Hot Sale', 'Quilmes', 'Suzuki Quilmes']) {
      expect(h).toContain(x)
    }
    expect(h.match(/data:image\/jpeg;base64,/g)).toHaveLength(3)
  })
  it('lo que se sacó no se escribe: sin precio ni condición no aparece ningún "$"', async () => {
    const t = textos(2)
    const { html: h } = await html(pedido(2, {}, { motos: t.motos.map((m) => ({ ...m, precio: '', condicion: '' })) }))
    expect(h).not.toContain('$')
    expect(h).toContain('ROUSER 200')
  })
  it('usa los nombres de familia que el render registra: Anton e Inter, y pide solo esas dos fuentes', async () => {
    const { render, html: h } = await html(pedido(2))
    expect(h).toMatch(/font-family:Anton/)
    expect(h).toMatch(/font-family:Inter/)
    expect(render.mock.calls[0]![2]).toEqual(['anton', 'inter'])
  })
  it('el logo 999 va como imagen y el nombre de la concesionaria en letras si no hay logo', async () => {
    const { html: h } = await html(pedido(2))
    expect(h).toContain('data:image/png;base64,AAAA')
    expect(h).toContain('Suzuki Quilmes')
  })
  it('la 999motos no repite su nombre en letras', async () => {
    const { html: h } = await html(pedido(2, {}, { marca: '999 Motos' }))
    expect(h).not.toContain('999 Motos')
  })
  it('un texto que no entra falla ANTES de renderizar, con la moto en el mensaje', async () => {
    const render = vi.fn<Render>(async () => PNG)
    const t = textos(4)
    const malo = pedido(4, { grilla: { ...pedido(4).grilla!, formato: '1:1', textos: { ...t, motos: t.motos.map((m, i) => (i === 1 ? { ...m, modelo: 'M'.repeat(60) } : m)) } } })
    await expect(componerPlaca(malo, render)).rejects.toThrow(ErrorTextoLargo)
    await expect(componerPlaca(malo, render)).rejects.toThrow(/Moto 2/)
    expect(render).not.toHaveBeenCalled()
  })
  it('sin el pedido de la grilla, o con otra cantidad de fotos que de motos, no se dibuja', async () => {
    const render = vi.fn<Render>(async () => PNG)
    await expect(componerPlaca(pedido(3, { grilla: undefined }), render)).rejects.toThrow(/grilla/i)
    await expect(componerPlaca(pedido(3, { grilla: { ...pedido(3).grilla!, fotos: [foto(), foto()] } }), render)).rejects.toThrow(/fotos/i)
    expect(render).not.toHaveBeenCalled()
  })
  it('el render que falla propaga el error', async () => {
    await expect(componerPlaca(pedido(2), async () => { throw new Error('se rompió') })).rejects.toThrow('se rompió')
  })
})
