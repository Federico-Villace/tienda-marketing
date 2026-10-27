import { describe, it, expect } from 'vitest'
import { fuenteMontos, fuenteMontosPlaca, formatearPrecio, hashDatos, lineaPromo, TIENE_EMOJI, validarDatos, validarDescripcionFondo, validarLineaExtra, validarModelo, validarPedido, validarTitular } from './datos'
import { MARCAS } from '../datos/marcas'

const FOTO = '11111111-1111-4111-8111-111111111111'
const pedido = (o: Record<string, unknown> = {}) => ({
  marcaId: MARCAS[3]!.id,
  modelo: 'TRK 502',
  precio: { moneda: 'ARS', monto: 4_500_000 },
  promo: { tipo: 'cuotas', detalle: '12 cuotas sin interés' },
  lugar: 'Quilmes',
  indicaciones: 'Mencionar que hay stock',
  fotoId: FOTO,
  aspecto: '4:5',
  ...o,
})
const errores = (r: { ok: boolean } & Record<string, unknown>) => (r.ok ? [] : (r.errores as string[]))

describe('formatearPrecio', () => {
  it('pesos con separador de miles y sin decimales', () => {
    expect(formatearPrecio({ moneda: 'ARS', monto: 4_500_000 })).toBe('$ 4.500.000')
    expect(formatearPrecio({ moneda: 'ARS', monto: 950 })).toBe('$ 950')
    expect(formatearPrecio({ moneda: 'ARS', monto: 12_345 })).toBe('$ 12.345')
  })
  it('dólares con el prefijo US$', () => {
    expect(formatearPrecio({ moneda: 'USD', monto: 5990 })).toBe('US$ 5.990')
    expect(formatearPrecio({ moneda: 'USD', monto: 12 })).toBe('US$ 12')
  })
  it('no depende de la locale del entorno: espacio común, nunca duro', () => {
    expect(formatearPrecio({ moneda: 'ARS', monto: 1_000_000 })).not.toMatch(/[  ]/)
  })
})

describe('lineaPromo', () => {
  it('usa el detalle si hay; si no, la etiqueta del tipo', () => {
    expect(lineaPromo({ tipo: 'cuotas', detalle: '12 cuotas sin interés' })).toBe('12 cuotas sin interés')
    expect(lineaPromo({ tipo: 'contado', detalle: '' })).toBe('Contado')
    expect(lineaPromo({ tipo: 'credito', detalle: '' })).toBe('Crédito')
    expect(lineaPromo({ tipo: 'oferta', detalle: '' })).toBe('Oferta')
    expect(lineaPromo({ tipo: 'cuotas', detalle: '' })).toBe('Cuotas')
  })
  it('"ninguna" no muestra nada salvo que haya detalle', () => {
    expect(lineaPromo({ tipo: 'ninguna', detalle: '' })).toBe('')
    expect(lineaPromo({ tipo: 'ninguna', detalle: 'Última unidad' })).toBe('Última unidad')
  })
})

describe('validarModelo', () => {
  it('recorta y acepta de 2 a 60 caracteres', () => {
    expect(validarModelo('  TRK 502 ')).toEqual({ ok: true, modelo: 'TRK 502' })
    expect(validarModelo('a').ok).toBe(false)
    expect(validarModelo('a'.repeat(61)).ok).toBe(false)
    expect(validarModelo('a'.repeat(60)).ok).toBe(true)
  })
  it('sin emojis', () => {
    expect(validarModelo('TRK 502 🏍️').ok).toBe(false)
    expect(TIENE_EMOJI.test('hola')).toBe(false)
  })
  it('no es un texto', () => {
    expect(validarModelo(5).ok).toBe(false)
  })
})

describe('validarDatos', () => {
  const datos = (o: Record<string, unknown> = {}) => ({
    precio: { moneda: 'ARS', monto: 4_500_000 },
    promo: { tipo: 'contado', detalle: '' },
    lugar: 'Quilmes',
    indicaciones: '',
    ...o,
  })

  it('acepta datos válidos y los devuelve normalizados', () => {
    const r = validarDatos(datos({ lugar: '  Bernal ', indicaciones: ' hola ', promo: { tipo: 'cuotas', detalle: ' 12 cuotas ' } }))
    expect(r).toEqual({
      ok: true,
      datos: {
        precio: { moneda: 'ARS', monto: 4_500_000 },
        promo: { tipo: 'cuotas', detalle: '12 cuotas' },
        lugar: 'Bernal',
        indicaciones: 'hola',
      },
    })
  })
  it('lugar vacío o ausente queda en Quilmes', () => {
    expect((validarDatos(datos({ lugar: '' })) as any).datos.lugar).toBe('Quilmes')
    const { lugar: _l, ...sin } = datos()
    expect((validarDatos(sin) as any).datos.lugar).toBe('Quilmes')
  })
  it('indicaciones ausentes quedan vacías', () => {
    const { indicaciones: _i, ...sin } = datos()
    expect((validarDatos(sin) as any).datos.indicaciones).toBe('')
  })
  it('el monto tiene que ser un número entero: "4.500.000" como texto se rechaza', () => {
    expect(validarDatos(datos({ precio: { moneda: 'ARS', monto: '4.500.000' } })).ok).toBe(false)
  })
  it('el monto nunca se redondea: 4500000.5 se rechaza', () => {
    expect(validarDatos(datos({ precio: { moneda: 'ARS', monto: 4_500_000.5 } })).ok).toBe(false)
  })
  it('monto entre 1 y 999.999.999 en pesos y hasta 9.999.999 en dólares', () => {
    expect(validarDatos(datos({ precio: { moneda: 'ARS', monto: 0 } })).ok).toBe(false)
    expect(validarDatos(datos({ precio: { moneda: 'ARS', monto: -5 } })).ok).toBe(false)
    expect(validarDatos(datos({ precio: { moneda: 'ARS', monto: 999_999_999 } })).ok).toBe(true)
    expect(validarDatos(datos({ precio: { moneda: 'ARS', monto: 1_000_000_000 } })).ok).toBe(false)
    expect(validarDatos(datos({ precio: { moneda: 'USD', monto: 9_999_999 } })).ok).toBe(true)
    expect(validarDatos(datos({ precio: { moneda: 'USD', monto: 10_000_000 } })).ok).toBe(false)
  })
  it('la moneda es ARS o USD', () => {
    expect(validarDatos(datos({ precio: { moneda: 'EUR', monto: 10 } })).ok).toBe(false)
  })
  it('el tipo de promo es uno de la lista', () => {
    expect(validarDatos(datos({ promo: { tipo: 'regalo', detalle: '' } })).ok).toBe(false)
  })
  it('el detalle admite hasta 80 caracteres, sin emojis', () => {
    expect(validarDatos(datos({ promo: { tipo: 'oferta', detalle: 'a'.repeat(81) } })).ok).toBe(false)
    expect(validarDatos(datos({ promo: { tipo: 'oferta', detalle: 'Oferta 🔥' } })).ok).toBe(false)
  })
  it('el detalle no puede llevar emails ni teléfonos', () => {
    expect(validarDatos(datos({ promo: { tipo: 'oferta', detalle: 'Escribí a ventas@999motos.com.ar' } })).ok).toBe(false)
    expect(validarDatos(datos({ promo: { tipo: 'oferta', detalle: 'Llamá al 11 5555 1234' } })).ok).toBe(false)
  })
  it('un monto grande en el detalle no se confunde con un teléfono', () => {
    expect(validarDatos(datos({ promo: { tipo: 'cuotas', detalle: '12 cuotas de $ 12.500.000' } })).ok).toBe(true)
  })
  it('el lugar admite hasta 60 caracteres, sin emojis', () => {
    expect(validarDatos(datos({ lugar: 'a'.repeat(61) })).ok).toBe(false)
    expect(validarDatos(datos({ lugar: 'Quilmes 📍' })).ok).toBe(false)
  })
  it('las indicaciones admiten hasta 500 caracteres', () => {
    expect(validarDatos(datos({ indicaciones: 'a'.repeat(501) })).ok).toBe(false)
    expect(validarDatos(datos({ indicaciones: 'a'.repeat(500) })).ok).toBe(true)
  })
  it('claves de más o faltantes se rechazan, con un mensaje en castellano', () => {
    const r = validarDatos({ ...datos(), extra: 1 })
    expect(errores(r as any).join(' ')).toMatch(/no está permitido/)
    const s = validarDatos({ promo: { tipo: 'contado', detalle: '' } })
    expect(errores(s as any).join(' ')).toMatch(/precio/)
  })
  it('no es un objeto', () => {
    expect(validarDatos(null).ok).toBe(false)
    expect(validarDatos([]).ok).toBe(false)
  })
  it('junta todos los errores, no solo el primero', () => {
    const r = validarDatos(datos({ precio: { moneda: 'EUR', monto: 0 }, promo: { tipo: 'x', detalle: '' } }))
    expect(errores(r as any).length).toBeGreaterThanOrEqual(2)
  })
})

describe('validarPedido (POST /api/promociones)', () => {
  it('un pedido válido devuelve los datos y el resto aparte', () => {
    const r = validarPedido(pedido())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.pedido).toEqual({
      marcaId: MARCAS[3]!.id,
      modelo: 'TRK 502',
      fotoId: FOTO,
      aspecto: '4:5',
      datos: {
        precio: { moneda: 'ARS', monto: 4_500_000 },
        promo: { tipo: 'cuotas', detalle: '12 cuotas sin interés' },
        lugar: 'Quilmes',
        indicaciones: 'Mencionar que hay stock',
      },
    })
  })
  it('la marca tiene que ser una de las 7', () => {
    expect(validarPedido(pedido({ marcaId: 'otra' })).ok).toBe(false)
  })
  it('la foto tiene que ser un id válido', () => {
    expect(validarPedido(pedido({ fotoId: 'abc' })).ok).toBe(false)
  })
  it('el formato es 1:1, 4:5 o 9:16', () => {
    expect(validarPedido(pedido({ aspecto: '16:9' })).ok).toBe(false)
    expect(validarPedido(pedido({ aspecto: '9:16' })).ok).toBe(true)
  })
  it('el modelo se valida igual que en validarModelo', () => {
    expect(validarPedido(pedido({ modelo: 'x' })).ok).toBe(false)
  })
  it('el monto como texto es inválido', () => {
    expect(validarPedido(pedido({ precio: { moneda: 'ARS', monto: '4.500.000' } })).ok).toBe(false)
  })
  it('claves desconocidas se rechazan', () => {
    expect(errores(validarPedido(pedido({ costoUsd: 0 })) as any).join(' ')).toMatch(/costoUsd/)
  })
  it('no es un objeto', () => {
    expect(validarPedido('hola').ok).toBe(false)
  })
})

describe('fuenteMontos', () => {
  it('incluye el precio formateado, el monto crudo, el detalle y las indicaciones', () => {
    const f = fuenteMontos({
      precio: { moneda: 'ARS', monto: 4_500_000 },
      promo: { tipo: 'cuotas', detalle: '12 cuotas sin interés' },
      lugar: 'Quilmes',
      indicaciones: 'Anticipo $ 900.000',
    })
    expect(f).toContain('$ 4.500.000')
    expect(f).toContain('4500000')
    expect(f).toContain('12 cuotas sin interés')
    expect(f).toContain('$ 900.000')
  })
})

describe('hashDatos', () => {
  const d = { precio: { moneda: 'ARS', monto: 1 }, promo: { tipo: 'contado', detalle: '' }, lugar: 'Quilmes', indicaciones: '' } as const
  it('es estable aunque cambie el orden de las claves', () => {
    expect(hashDatos(d)).toBe(hashDatos({ indicaciones: '', lugar: 'Quilmes', promo: { detalle: '', tipo: 'contado' }, precio: { monto: 1, moneda: 'ARS' } }))
  })
  it('cambia si cambia un dato', () => {
    expect(hashDatos(d)).not.toBe(hashDatos({ ...d, lugar: 'Bernal' }))
  })
})

describe('validarTitular', () => {
  it('recorta y acepta de 1 a 40 caracteres', () => {
    expect(validarTitular('  Tu próxima aventura ')).toEqual({ ok: true, titular: 'Tu próxima aventura' })
    expect(validarTitular('').ok).toBe(false)
    expect(validarTitular('a'.repeat(41)).ok).toBe(false)
    expect(validarTitular('a'.repeat(40)).ok).toBe(true)
  })
  it('sin precios ni números: el precio va aparte, en la placa', () => {
    expect(validarTitular('Ahora $ 4.500.000').ok).toBe(false)
    expect(validarTitular('Hasta 12 cuotas').ok).toBe(false)
    expect(validarTitular('Llevátela hoy').ok).toBe(true)
  })
  it('sin emojis', () => {
    expect(validarTitular('Vamos 🔥').ok).toBe(false)
  })
  it('el máximo se puede achicar (el texto al costado tiene menos lugar)', () => {
    expect(validarTitular('a'.repeat(28), 28).ok).toBe(true)
    const r = validarTitular('a'.repeat(29), 28)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.join(' ')).toMatch(/28/)
  })
})

describe('validarDescripcionFondo', () => {
  it('es opcional: vacío, espacios o null dan null', () => {
    expect(validarDescripcionFondo(undefined)).toEqual({ ok: true, descripcion: null })
    expect(validarDescripcionFondo(null)).toEqual({ ok: true, descripcion: null })
    expect(validarDescripcionFondo('   \n ')).toEqual({ ok: true, descripcion: null })
  })
  it('acepta hasta 300 caracteres y avisa en castellano si se pasa', () => {
    expect(validarDescripcionFondo('a'.repeat(300)).ok).toBe(true)
    const r = validarDescripcionFondo('a'.repeat(301))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores).toEqual(['La descripción del fondo admite hasta 300 caracteres.'])
  })
  it('sanitiza: saltos, tabs y espacios repetidos pasan a un espacio; se sacan los delimitadores', () => {
    expect(validarDescripcionFondo('  Calle de noche,\n\ncon  luces\tcálidas «lindas» ')).toEqual({ ok: true, descripcion: 'Calle de noche, con luces cálidas lindas' })
  })
  it('saca caracteres de control y separadores raros', () => {
    expect(validarDescripcionFondo('a\u0000b\u2028c\u200bd')).toEqual({ ok: true, descripcion: 'a b c d' })
  })
  it('lo que no es texto se rechaza', () => {
    expect(validarDescripcionFondo(42).ok).toBe(false)
    expect(validarDescripcionFondo({}).ok).toBe(false)
  })
})

describe('validarLineaExtra', () => {
  const datos = { precio: { moneda: 'ARS', monto: 4_500_000 }, promo: { tipo: 'cuotas', detalle: '12 cuotas sin interés' }, lugar: 'Quilmes', indicaciones: '' } as const
  it('es opcional y se recorta', () => {
    expect(validarLineaExtra(undefined, datos)).toEqual({ ok: true, linea: null })
    expect(validarLineaExtra('  ', datos)).toEqual({ ok: true, linea: null })
    expect(validarLineaExtra('  Hot Sale · Solo este fin de semana ', datos)).toEqual({ ok: true, linea: 'Hot Sale · Solo este fin de semana' })
  })
  it('respeta el máximo (60 por defecto, achicable)', () => {
    expect(validarLineaExtra('a'.repeat(60), datos).ok).toBe(true)
    expect(validarLineaExtra('a'.repeat(61), datos).ok).toBe(false)
    const r = validarLineaExtra('a'.repeat(37), datos, 36)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.join(' ')).toMatch(/36/)
  })
  it('sin emojis (satori los baja de internet)', () => {
    const r = validarLineaExtra('Hot Sale 🔥', datos)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores).toEqual(['La línea extra no puede llevar emojis.'])
  })
  it('sin emails ni teléfonos', () => {
    expect(validarLineaExtra('Escribinos al 11 5555 1234', datos).ok).toBe(false)
    expect(validarLineaExtra('hola@x.com', datos).ok).toBe(false)
  })
  it('el único precio permitido es el cargado: otro monto se bloquea', () => {
    const r = validarLineaExtra('Hoy $ 3.900.000', datos)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores[0]).toMatch(/precio/)
    expect(validarLineaExtra('Ahora 30% menos', datos).ok).toBe(false)
    expect(validarLineaExtra('USD 5990', datos).ok).toBe(false)
  })
  it('repetir el precio cargado o las cuotas de la promo está bien', () => {
    expect(validarLineaExtra('Llevátela por $ 4.500.000', datos).ok).toBe(true)
    expect(validarLineaExtra('En 12 cuotas sin interés', datos).ok).toBe(true)
    expect(validarLineaExtra('En 24 cuotas', datos).ok).toBe(false)
  })
  it('números que no son plata pasan (2x1, 48 hs)', () => {
    expect(validarLineaExtra('Solo por 48 hs', datos).ok).toBe(true)
    expect(validarLineaExtra('Promo 2x1 en accesorios', datos).ok).toBe(true)
  })
  it('lo que no es texto se rechaza', () => {
    expect(validarLineaExtra(7, datos).ok).toBe(false)
  })
})

describe('fuenteMontosPlaca', () => {
  it('respalda solo lo que se dibuja: el precio y el detalle de la promo, no las indicaciones', () => {
    const f = fuenteMontosPlaca({ precio: { moneda: 'USD', monto: 5990 }, promo: { tipo: 'cuotas', detalle: '6 cuotas' }, lugar: 'Q', indicaciones: 'bonificación $ 100.000' })
    expect(f).toContain('US$ 5.990')
    expect(f).toContain('5990')
    expect(f).toContain('6 cuotas')
    expect(f).not.toContain('100.000')
  })
})
