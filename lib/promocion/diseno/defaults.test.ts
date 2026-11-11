import { describe, it, expect } from 'vitest'
import { condicionPorDefecto, numeroDeModelo, resolverDiseno } from './defaults'
import { validarDiseno } from './validar'
import { colorDe } from './paletas'
import { LIMITES_DISENO } from './tipos'
import type { DatosPromocion } from '../tipos'

const promo = (tipo: DatosPromocion['promo']['tipo'], detalle = ''): DatosPromocion['promo'] => ({ tipo, detalle })
const datos = (p: DatosPromocion['promo']): DatosPromocion => ({ precio: { moneda: 'ARS', monto: 4_500_000 }, promo: p, lugar: 'Quilmes', indicaciones: '' })

describe('condicionPorDefecto (R3)', () => {
  it('cuotas con detalle "12 cuotas sin interés" → 12 CUOTAS / SIN INTERÉS', () => {
    expect(condicionPorDefecto(promo('cuotas', '12 cuotas sin interés'))).toEqual({ texto: '12 CUOTAS', destacado: 'SIN INTERÉS' })
  })
  it('cuotas sin número → el detalle en mayúsculas', () => {
    expect(condicionPorDefecto(promo('cuotas', 'Cuotas fijas'))).toEqual({ texto: 'CUOTAS FIJAS', destacado: '' })
    expect(condicionPorDefecto(promo('cuotas'))).toEqual({ texto: 'CUOTAS', destacado: '' })
  })
  it('contado y crédito', () => {
    expect(condicionPorDefecto(promo('contado'))).toEqual({ texto: 'CONTADO', destacado: '' })
    expect(condicionPorDefecto(promo('credito'))).toEqual({ texto: 'CRÉDITO', destacado: '' })
  })
  it('oferta con detalle libre: el detalle en mayúsculas, recortado a 22', () => {
    expect(condicionPorDefecto(promo('oferta', 'Hot Sale'))).toEqual({ texto: 'HOT SALE', destacado: '' })
    const larga = condicionPorDefecto(promo('oferta', 'Solo este fin de semana en todo el local'))
    expect(larga.texto.length).toBeLessThanOrEqual(LIMITES_DISENO.CONDICION_TEXTO)
    expect(larga.texto.startsWith('SOLO ESTE FIN')).toBe(true)
  })
  it('oferta sin detalle → OFERTA; ninguna sin detalle → vacío (no se dibuja el bloque)', () => {
    expect(condicionPorDefecto(promo('oferta'))).toEqual({ texto: 'OFERTA', destacado: '' })
    expect(condicionPorDefecto(promo('ninguna'))).toEqual({ texto: '', destacado: '' })
  })
  it('lo que sale siempre respeta los largos que valida el servidor', () => {
    const c = condicionPorDefecto(promo('cuotas', '12 cuotas sin interés con tarjetas seleccionadas de todos los bancos'))
    expect(c.texto.length).toBeLessThanOrEqual(LIMITES_DISENO.CONDICION_TEXTO)
    expect(c.destacado.length).toBeLessThanOrEqual(LIMITES_DISENO.CONDICION_DESTACADO)
  })
})

describe('numeroDeModelo', () => {
  it('el primer grupo de dígitos', () => {
    expect(numeroDeModelo('TRK 251 ABS')).toBe('251')
    expect(numeroDeModelo('Z400')).toBe('400')
    expect(numeroDeModelo('MT-03')).toBe('03')
  })
  it('sin dígitos → vacío; más de 4 → los primeros 4', () => {
    expect(numeroDeModelo('Vespa Primavera')).toBe('')
    expect(numeroDeModelo('Ruta 123456')).toBe('1234')
  })
})

describe('resolverDiseno', () => {
  const fila = { modelo: 'TRK 251 ABS', titular: 'Aventura sin límites', datos: datos(promo('cuotas', '12 cuotas sin interés')) }

  it('null → todos los defaults: frase del titular, condición de la promo, precio visible, tamaños en 0', () => {
    const r = resolverDiseno(null, 'editorial', fila)
    expect(r).toMatchObject({
      acento: 'naranja',
      mostrarPrecio: true,
      condicion: { texto: '12 CUOTAS', destacado: 'SIN INTERÉS' },
      cta: 'Consultanos',
      frase: 'Aventura sin límites',
      lista: [],
      numero: '251',
      tamanos: { modelo: 0, frase: 0, precio: 0 },
      logoMarca: null,
    })
  })

  it('el acento por defecto es el primero de la paleta de la plantilla', () => {
    expect(resolverDiseno(null, 'impactante_textura', fila).acento).toBe('azul')
    expect(resolverDiseno(null, 'deportiva', fila).acento).toBe('amarillo')
  })

  it('lo guardado manda sobre el default, campo por campo', () => {
    const r = resolverDiseno({ acento: 'rojo', frase: 'Otra frase', tamanos: { modelo: 2 }, mostrarPrecio: false }, 'impactante_textura', fila)
    expect(r.acento).toBe('rojo')
    expect(r.frase).toBe('Otra frase')
    expect(r.tamanos).toEqual({ modelo: 2, frase: 0, precio: 0 })
    expect(r.mostrarPrecio).toBe(false)
    expect(r.condicion.texto).toBe('12 CUOTAS')
  })

  it('un titular de 40 caracteres se recorta a la frase de 28 sin cortar palabras', () => {
    const r = resolverDiseno(null, 'impactante_textura', { ...fila, titular: 'Llevate la aventura que siempre soñaste' })
    expect(r.frase.length).toBeLessThanOrEqual(LIMITES_DISENO.FRASE)
    expect(r.frase).toBe('Llevate la aventura que')
  })

  it('sin titular, la frase queda vacía (la placa no dibuja el bloque)', () => {
    expect(resolverDiseno(null, 'deportiva', { ...fila, titular: '' }).frase).toBe('')
  })

  it('lo resuelto por defecto pasa la validación del servidor', () => {
    const r = resolverDiseno(null, 'editorial', fila)
    const v = validarDiseno({ acento: r.acento, condicion: r.condicion, frase: r.frase, numero: r.numero, cta: r.cta }, 'editorial', { datos: fila.datos, logosMarca: [] })
    expect(v.ok).toBe(true)
  })
})

describe('el acento por defecto de cada plantilla (el primero de su paleta)', () => {
  const fila = { modelo: 'TRK 502', titular: 'Tu próxima aventura', datos: { precio: { moneda: 'ARS' as const, monto: 1 }, promo: { tipo: 'ninguna' as const, detalle: '' }, lugar: 'Quilmes', indicaciones: '' } }
  it('la deportiva sale en amarillo flúor, como la referencia (no naranja)', () => {
    expect(resolverDiseno(null, 'deportiva', fila).acento).toBe('amarillo')
    expect(colorDe('deportiva', 'amarillo').hex).toBe('#E4FF1A')
  })
  it('impactante en azul y editorial en naranja', () => {
    expect(resolverDiseno(null, 'impactante_textura', fila).acento).toBe('azul')
    expect(resolverDiseno(null, 'editorial', fila).acento).toBe('naranja')
  })
})
