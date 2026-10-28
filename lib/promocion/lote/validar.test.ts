import { describe, it, expect } from 'vitest'
import { validarPedidoLote } from './validar'
import { MARCAS } from '../../datos/marcas'

const [M0, M1, M2, M3, M4, M5, M6] = MARCAS.map((m) => m.id) as [string, string, string, string, string, string, string]
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const moto = (n: number, o: Record<string, unknown> = {}) => ({
  fotoId: uuid(n),
  modelo: `TRK ${500 + n}`,
  precio: { moneda: 'ARS', monto: 4_000_000 + n },
  promo: { tipo: 'contado', detalle: '' },
  ...o,
})
const motos = (k: number) => Array.from({ length: k }, (_, i) => moto(i + 1))

const pedidoMotos = (o: Record<string, unknown> = {}) => ({
  tipo: 'motos',
  marcaIds: [M3],
  aspecto: '4:5',
  lugar: '',
  indicaciones: '',
  motos: motos(5),
  ...o,
})

const variante = (o: Record<string, unknown> = {}) => ({ titular: 'Salí a la ruta', ...o })
const pedidoTextos = (o: Record<string, unknown> = {}) => ({
  tipo: 'textos',
  marcaIds: [M3],
  fotoId: uuid(1),
  modelo: 'TRK 502',
  aspecto: '4:5',
  precio: { moneda: 'ARS', monto: 4_500_000 },
  promo: { tipo: 'cuotas', detalle: '12 cuotas sin interés' },
  lugar: '',
  indicaciones: '',
  variantes: [variante({ titular: 'Salí a la ruta' }), variante({ titular: 'Hot Sale' })],
  ...o,
})

describe('validarPedidoLote · motos (A)', () => {
  it('acepta 5 motos de una marca y arma los datos de cada una con el lugar y las indicaciones comunes', () => {
    const r = validarPedidoLote(pedidoMotos({ lugar: 'Berazategui', indicaciones: 'luz de tarde' }))
    expect(r.ok).toBe(true)
    if (!r.ok || r.pedido.tipo !== 'motos') throw new Error('x')
    expect(r.pedido.motos).toHaveLength(5)
    expect(r.pedido.motos[0]).toMatchObject({ fotoId: uuid(1), modelo: 'TRK 501' })
    expect(r.pedido.motos[0]!.datos).toEqual({
      precio: { moneda: 'ARS', monto: 4_000_001 },
      promo: { tipo: 'contado', detalle: '' },
      lugar: 'Berazategui',
      indicaciones: 'luz de tarde',
    })
    expect(r.pedido.aspecto).toBe('4:5')
  })

  it('el lugar vacío queda en Quilmes (como en una promoción suelta)', () => {
    const r = validarPedidoLote(pedidoMotos())
    if (!r.ok || r.pedido.tipo !== 'motos') throw new Error('x')
    expect(r.pedido.motos[0]!.datos.lugar).toBe('Quilmes')
  })

  it('motos: de 2 a 10', () => {
    for (const k of [0, 1, 11]) expect(validarPedidoLote(pedidoMotos({ motos: motos(k) })).ok).toBe(false)
    expect(validarPedidoLote(pedidoMotos({ motos: motos(2) })).ok).toBe(true)
    expect(validarPedidoLote(pedidoMotos({ motos: motos(10) })).ok).toBe(true)
    expect(validarPedidoLote(pedidoMotos({ motos: 'muchas' })).ok).toBe(false)
  })

  it('marcas: de 1 a 7, distintas, conocidas y en el orden de MARCAS', () => {
    for (const marcaIds of [[], [M0, M0], [M0, 'nope'], 'todas', undefined]) {
      expect(validarPedidoLote(pedidoMotos({ marcaIds })).ok).toBe(false)
    }
    const r = validarPedidoLote(pedidoMotos({ marcaIds: [M5, M3], motos: motos(2) }))
    if (!r.ok) throw new Error('x')
    expect(r.pedido.marcaIds).toEqual([M3, M5])
  })

  it('motos × marcas ≤ 14 placas, con un mensaje que dice cuántas son', () => {
    const r = validarPedidoLote(pedidoMotos({ marcaIds: [M0, M1, M2, M3], motos: motos(4) }))
    expect(r).toEqual({ ok: false, errores: ['Son 16 placas: el máximo por lote es 14. Sacá motos o marcas.'] })
    expect(validarPedidoLote(pedidoMotos({ marcaIds: [M0, M1, M2, M3, M4, M5, M6], motos: motos(2) })).ok).toBe(true)
    expect(validarPedidoLote(pedidoMotos({ marcaIds: [M0, M1, M2, M3, M4, M5, M6], motos: motos(3) })).ok).toBe(false)
    expect(validarPedidoLote(pedidoMotos({ marcaIds: [M0], motos: motos(10) })).ok).toBe(true)
  })

  it('cada moto necesita foto (uuid), modelo y precio válidos; el error dice cuál moto', () => {
    const r = validarPedidoLote(pedidoMotos({ motos: [moto(1), moto(2, { fotoId: 'no' }), moto(3, { modelo: 'x' }), moto(4, { precio: { moneda: 'ARS', monto: 1.5 } })] }))
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('x')
    expect(r.errores.some((e) => e.startsWith('Moto 2:') && e.includes('foto'))).toBe(true)
    expect(r.errores.some((e) => e.startsWith('Moto 3:'))).toBe(true)
    expect(r.errores.some((e) => e.startsWith('Moto 4:'))).toBe(true)
    expect(r.errores.some((e) => e.startsWith('Moto 1:'))).toBe(false)
  })

  it('la misma foto puede repetirse (dos precios de la misma moto)', () => {
    expect(validarPedidoLote(pedidoMotos({ motos: [moto(1), moto(2, { fotoId: uuid(1) })] })).ok).toBe(true)
  })

  it('formato inválido y campos de más se rechazan; el tipo es obligatorio', () => {
    expect(validarPedidoLote(pedidoMotos({ aspecto: '2:1' })).ok).toBe(false)
    expect(validarPedidoLote(pedidoMotos({ sobra: 1 })).ok).toBe(false)
    expect(validarPedidoLote(pedidoMotos({ motos: [moto(1), moto(2, { sobra: 1 })] })).ok).toBe(false)
    expect(validarPedidoLote(pedidoMotos({ tipo: 'grilla' })).ok).toBe(false)
    expect(validarPedidoLote(null).ok).toBe(false)
  })
})

describe('validarPedidoLote · textos (C)', () => {
  it('acepta 2 variantes: sin precio ni promo propios heredan los base', () => {
    const r = validarPedidoLote(pedidoTextos())
    expect(r.ok).toBe(true)
    if (!r.ok || r.pedido.tipo !== 'textos') throw new Error('x')
    expect(r.pedido.marcaIds).toEqual([M3])
    expect(r.pedido.fotoId).toBe(uuid(1))
    expect(r.pedido.variantes).toHaveLength(2)
    expect(r.pedido.variantes[0]).toMatchObject({ titular: 'Salí a la ruta', lineaExtra: null })
    expect(r.pedido.variantes[0]!.datos.precio).toEqual({ moneda: 'ARS', monto: 4_500_000 })
    expect(r.pedido.variantes[0]!.datos.promo).toEqual({ tipo: 'cuotas', detalle: '12 cuotas sin interés' })
  })

  it('cada variante puede traer su propio precio y su propia promo', () => {
    const r = validarPedidoLote(
      pedidoTextos({
        variantes: [variante(), variante({ titular: 'Hot Sale', precio: { moneda: 'ARS', monto: 4_200_000 }, promo: { tipo: 'oferta', detalle: 'Solo hoy' } })],
      }),
    )
    if (!r.ok || r.pedido.tipo !== 'textos') throw new Error('x')
    expect(r.pedido.variantes[1]!.datos.precio.monto).toBe(4_200_000)
    expect(r.pedido.variantes[1]!.datos.promo).toEqual({ tipo: 'oferta', detalle: 'Solo hoy' })
  })

  it('variantes: de 2 a 5', () => {
    const v = (k: number) => Array.from({ length: k }, (_, i) => variante({ titular: `Titular ${String.fromCharCode(65 + i)}` }))
    for (const k of [0, 1, 6]) expect(validarPedidoLote(pedidoTextos({ variantes: v(k) })).ok).toBe(false)
    expect(validarPedidoLote(pedidoTextos({ variantes: v(5) })).ok).toBe(true)
  })

  it('una sola marca', () => {
    expect(validarPedidoLote(pedidoTextos({ marcaIds: [M3, M5] })).ok).toBe(false)
    expect(validarPedidoLote(pedidoTextos({ marcaIds: [] })).ok).toBe(false)
  })

  it('el titular se valida como siempre: sin números ni emojis', () => {
    const r = validarPedidoLote(pedidoTextos({ variantes: [variante(), variante({ titular: 'Solo 4500' })] }))
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('x')
    expect(r.errores.some((e) => e.startsWith('Variante 2:'))).toBe(true)
  })

  it('la línea extra solo puede mostrar el monto DE ESA variante', () => {
    const base = { precio: { moneda: 'ARS', monto: 4_200_000 } }
    const ok = validarPedidoLote(pedidoTextos({ variantes: [variante(), variante({ titular: 'Hot Sale', ...base, lineaExtra: 'Antes $ 4.200.000' })] }))
    expect(ok.ok).toBe(true)
    // El precio base de las otras variantes no respalda el monto de ésta.
    const mal = validarPedidoLote(pedidoTextos({ variantes: [variante(), variante({ titular: 'Hot Sale', ...base, lineaExtra: 'Antes $ 4.500.000' })] }))
    expect(mal.ok).toBe(false)
    if (mal.ok) throw new Error('x')
    expect(mal.errores[0]).toMatch(/^Variante 2:/)
  })

  it('variantes idénticas (titular, línea extra, promo y precio) se rechazan y dicen cuáles', () => {
    const r = validarPedidoLote(pedidoTextos({ variantes: [variante(), variante({ titular: 'Otra' }), variante()] }))
    expect(r).toEqual({ ok: false, errores: ['Las variantes 1 y 3 son iguales.'] })
  })

  it('mismo titular pero distinta promo o precio: son distintas', () => {
    const r = validarPedidoLote(pedidoTextos({ variantes: [variante(), variante({ precio: { moneda: 'ARS', monto: 4_000_000 } })] }))
    expect(r.ok).toBe(true)
  })

  it('el modelo y la foto del pedido son obligatorios', () => {
    expect(validarPedidoLote(pedidoTextos({ fotoId: 'no' })).ok).toBe(false)
    expect(validarPedidoLote(pedidoTextos({ modelo: '' })).ok).toBe(false)
  })
})
