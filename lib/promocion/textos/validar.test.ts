import { describe, it, expect } from 'vitest'
import { validarCopy, validarOpciones, type ContextoTextos } from './validar'
import { datosDePrueba } from '../fixture'
import { fuenteMontos } from '../datos'

const ctx = (o: Partial<ContextoTextos> = {}): ContextoTextos => ({
  usuarioIg: 'benellistorequilmes',
  fuente: fuenteMontos(datosDePrueba()),
  ...o,
})
const opcion = (o: Record<string, unknown> = {}) => ({
  titular: 'Tu próxima aventura',
  hook: 'La TRK 502 te está esperando',
  copy: 'Pasá por Benelli Store Quilmes y llevátela hoy en 12 cuotas sin interés. Escribinos por DM.',
  hashtags: ['#benelli', '#trk502', '#quilmes'],
  cta: 'Escribinos por DM',
  altText: 'Una moto Benelli TRK 502 en un estudio',
  ...o,
})
const tres = (o: Record<string, unknown> = {}) => ({ opciones: [opcion(o), opcion({ titular: 'Salí a la ruta', ...o }), opcion({ titular: 'Ahora o nunca', ...o })] })
const errores = (r: any): string[] => (r.ok ? [] : r.errores)

describe('validarOpciones · forma', () => {
  it('acepta exactamente 3 opciones válidas', () => {
    const r = validarOpciones(tres(), ctx())
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.opciones).toHaveLength(3)
  })
  it('2 o 4 opciones no sirven', () => {
    expect(validarOpciones({ opciones: [opcion(), opcion()] }, ctx()).ok).toBe(false)
    expect(validarOpciones({ opciones: [opcion(), opcion(), opcion(), opcion()] }, ctx()).ok).toBe(false)
  })
  it('claves de más o de menos se rechazan', () => {
    expect(validarOpciones({ ...tres(), extra: 1 }, ctx()).ok).toBe(false)
    expect(validarOpciones(tres({ guion: 'x' }), ctx()).ok).toBe(false)
    const { cta: _c, ...sinCta } = opcion()
    expect(validarOpciones({ opciones: [sinCta, opcion(), opcion()] }, ctx()).ok).toBe(false)
  })
  it('no es un objeto', () => {
    expect(validarOpciones(null, ctx()).ok).toBe(false)
    expect(validarOpciones([], ctx()).ok).toBe(false)
  })
})

describe('validarOpciones · límites', () => {
  it.each([
    ['titular de 41 caracteres', { titular: 'a'.repeat(41) }],
    ['titular vacío', { titular: '' }],
    ['hook de 151', { hook: 'a'.repeat(151) }],
    ['copy de 2201', { copy: 'a'.repeat(2201) }],
    ['cta de 151', { cta: 'a'.repeat(151) }],
    ['altText de 1001', { altText: 'a'.repeat(1001) }],
    ['2 hashtags', { hashtags: ['#a', '#b'] }],
    ['9 hashtags', { hashtags: Array.from({ length: 9 }, (_, i) => `#h${i}`) }],
    ['un hashtag sin #', { hashtags: ['#a', 'b', '#c'] }],
    ['un hashtag con espacio', { hashtags: ['#a', '#b c', '#d'] }],
  ])('%s', (_n, o) => {
    expect(validarOpciones(tres(o), ctx()).ok).toBe(false)
  })
  it('el copy más los hashtags no pasan de 2200', () => {
    expect(validarOpciones(tres({ copy: 'a'.repeat(2195) }), ctx()).ok).toBe(false)
  })
  it('más de 30 hashtags entre la lista y el copy', () => {
    const enCopy = Array.from({ length: 28 }, (_, i) => `#x${i}`).join(' ')
    expect(validarOpciones(tres({ copy: enCopy }), ctx()).ok).toBe(false)
  })
})

describe('validarOpciones · titular', () => {
  it('sin números ni montos: el precio va aparte', () => {
    expect(validarOpciones(tres({ titular: 'Desde $ 4.500.000' }), ctx()).ok).toBe(false)
    expect(validarOpciones(tres({ titular: '12 cuotas sin interés' }), ctx()).ok).toBe(false)
    expect(validarOpciones(tres({ titular: 'Solo por hoy 2x1' }), ctx()).ok).toBe(false)
  })
  it('sin emojis', () => {
    expect(validarOpciones(tres({ titular: 'Vamos 🔥' }), ctx()).ok).toBe(false)
  })
})

describe('validarOpciones · el precio y los montos', () => {
  it('el precio cargado SÍ está respaldado: queda tal cual', () => {
    const r = validarOpciones(tres({ copy: 'Hoy a $ 4.500.000 o en 12 cuotas. Escribinos por DM.' }), ctx())
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.opciones[0]!.copy).toContain('$ 4.500.000')
  })
  it('también si el modelo lo escribe sin espacio o con US$', () => {
    const r = validarOpciones(tres({ copy: 'Llevátela por $4.500.000.' }), ctx())
    expect(r.ok && r.opciones[0]!.copy).toContain('$4.500.000')
  })
  it('un monto inventado se cambia por [precio] y no tira el pedido (ya se pagó)', () => {
    const r = validarOpciones(tres({ copy: 'Antes $ 6.000.000, hoy $ 4.500.000.', hook: 'Descuento del 30%' }), ctx())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.opciones[0]!.copy).toBe('Antes [precio], hoy $ 4.500.000.')
    expect(r.opciones[0]!.hook).toBe('Descuento del [precio]')
  })
  it('las cuotas del detalle están respaldadas; otras cuotas no', () => {
    const ok = validarOpciones(tres({ copy: 'En 12 cuotas sin interés.' }), ctx())
    expect(ok.ok && ok.opciones[0]!.copy).toBe('En 12 cuotas sin interés.')
    const mal = validarOpciones(tres({ copy: 'En 24 cuotas sin interés.' }), ctx())
    expect(mal.ok && mal.opciones[0]!.copy).toBe('En [precio] sin interés.')
  })
  it('un monto de las indicaciones también cuenta como fuente', () => {
    const fuente = fuenteMontos({ ...datosDePrueba(), indicaciones: 'Anticipo $ 900.000' })
    const r = validarOpciones(tres({ copy: 'Anticipo desde $ 900.000.' }), ctx({ fuente }))
    expect(r.ok && r.opciones[0]!.copy).toBe('Anticipo desde $ 900.000.')
  })
})

describe('validarOpciones · contacto y menciones', () => {
  it('sin emails ni teléfonos', () => {
    expect(validarOpciones(tres({ copy: 'Escribinos a ventas@999motos.com.ar' }), ctx()).ok).toBe(false)
    expect(validarOpciones(tres({ cta: 'Llamá al 11 5555 1234' }), ctx()).ok).toBe(false)
  })
  it('un precio grande no se confunde con un teléfono', () => {
    const fuente = fuenteMontos({ ...datosDePrueba(), precio: { moneda: 'ARS', monto: 12_500_000 } })
    expect(validarOpciones(tres({ copy: 'Hoy $ 12.500.000.' }), ctx({ fuente })).ok).toBe(true)
  })
  it('solo se menciona la cuenta de la marca', () => {
    expect(validarOpciones(tres({ copy: 'Seguinos en @benellistorequilmes.' }), ctx()).ok).toBe(true)
    expect(validarOpciones(tres({ copy: 'Seguinos en @otra_cuenta' }), ctx()).ok).toBe(false)
    expect(validarOpciones(tres({ copy: 'Mirá a @suzukiquilmescentro' }), ctx()).ok).toBe(false)
  })
  it('WhatsApp solo si figura en la fuente (las indicaciones)', () => {
    expect(validarOpciones(tres({ cta: 'Escribinos por WhatsApp' }), ctx()).ok).toBe(false)
    const fuente = fuenteMontos({ ...datosDePrueba(), indicaciones: 'Atender por WhatsApp' })
    expect(validarOpciones(tres({ cta: 'Escribinos por WhatsApp' }), ctx({ fuente })).ok).toBe(true)
  })
  it('junta los errores en castellano', () => {
    const r = validarOpciones(tres({ titular: 'a'.repeat(50) }), ctx())
    expect(errores(r).join(' ')).toMatch(/titular/)
  })
})

describe('validarCopy (una edición humana)', () => {
  it('acepta un texto editado y NO reemplaza montos: el humano es la fuente', () => {
    const r = validarCopy(opcion({ copy: 'Ahora $ 9.999.999, ¡aprovechá!' }), ctx())
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.copy.copy).toBe('Ahora $ 9.999.999, ¡aprovechá!')
  })
  it('tampoco exige respaldo para WhatsApp', () => {
    expect(validarCopy(opcion({ cta: 'Escribinos por WhatsApp' }), ctx()).ok).toBe(true)
  })
  it('pero respeta límites, forma, menciones y contacto', () => {
    expect(validarCopy(opcion({ hook: 'a'.repeat(151) }), ctx()).ok).toBe(false)
    expect(validarCopy({ ...opcion(), extra: 1 }, ctx()).ok).toBe(false)
    expect(validarCopy(opcion({ copy: 'Hola @otra_cuenta' }), ctx()).ok).toBe(false)
    expect(validarCopy(opcion({ copy: 'ventas@999motos.com.ar' }), ctx()).ok).toBe(false)
    expect(validarCopy(opcion({ titular: 'Desde 5' }), ctx()).ok).toBe(false)
  })
  it('un marcador [precio] sin completar es válido (la pantalla avisa)', () => {
    expect(validarCopy(opcion({ copy: 'Hoy a [precio].' }), ctx()).ok).toBe(true)
  })
})
