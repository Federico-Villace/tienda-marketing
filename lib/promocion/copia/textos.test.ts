import { describe, it, expect } from 'vitest'
import { limpiarTextoPrompt, textosCopiaFiel, textosVisibles } from './textos'
import { hashTextos } from './hash-textos'
import { esCopiaFiel, PLANTILLA_COPIA } from './tipos'
import { filaPromocion } from '../fixture'
import { datosDePrueba } from '../fixture'

const fila = (o: Parameters<typeof filaPromocion>[0] = {}) => filaPromocion({ modelo: 'ROUSER 200', titular: 'Tu próxima moto', ...o })
const con = { negocio: 'Suzuki Quilmes', logoDibujable: true }

describe('copia fiel · tipos', () => {
  it('esCopiaFiel solo reconoce copia_fiel', () => {
    expect(PLANTILLA_COPIA).toBe('copia_fiel')
    expect(esCopiaFiel('copia_fiel')).toBe(true)
    expect(esCopiaFiel('impactante_textura')).toBe(false)
    expect(esCopiaFiel(null)).toBe(false)
  })
})

describe('textosCopiaFiel', () => {
  it('arma modelo, precio, condición, frase, botón y lugar de la promoción', () => {
    expect(textosCopiaFiel(fila(), con)).toEqual({
      modelo: 'ROUSER 200',
      precio: '$ 4.500.000',
      condicion: { texto: '12 CUOTAS', destacado: 'SIN INTERÉS' },
      frase: 'Tu próxima moto',
      cta: 'Consultanos',
      lugar: 'Quilmes',
      negocio: null,
      logo: 'real',
      ocultos: [],
    })
  })
  it('precio en dólares', () => {
    expect(textosCopiaFiel(fila({ datos: { ...datosDePrueba(), precio: { moneda: 'USD', monto: 5990 } } }), con).precio).toBe('US$ 5.990')
  })
  it('mostrarPrecio=false => sin precio (la copia fiel no escribe "Consultá precio")', () => {
    expect(textosCopiaFiel(fila({ diseno: { mostrarPrecio: false } }), con).precio).toBeNull()
  })
  it('condición guardada por la persona; vacía => null', () => {
    expect(textosCopiaFiel(fila({ diseno: { condicion: { texto: 'CONTADO', destacado: '' } } }), con).condicion).toEqual({ texto: 'CONTADO', destacado: '' })
    expect(textosCopiaFiel(fila({ diseno: { condicion: { texto: '', destacado: '' } } }), con).condicion).toBeNull()
    expect(textosCopiaFiel(fila({ datos: { ...datosDePrueba(), promo: { tipo: 'ninguna', detalle: '' } } }), con).condicion).toBeNull()
  })
  it('frase: la guardada, el titular recortado a 28 o vacía => null', () => {
    expect(textosCopiaFiel(fila({ diseno: { frase: 'Rompé la rutina' } }), con).frase).toBe('Rompé la rutina')
    const larga = textosCopiaFiel(fila({ titular: 'Una frase larguísima que no entra en veintiocho caracteres' }), con).frase!
    expect(larga.length).toBeLessThanOrEqual(28)
    expect(textosCopiaFiel(fila({ titular: '' }), con).frase).toBeNull()
  })
  it('el titular del texto elegido en el paso 3 vale si no hay uno propio', () => {
    expect(textosCopiaFiel(fila({ titular: null, copy: { titular: 'Del texto', hook: 'h', copy: 'c', hashtags: [], cta: 'x', altText: 'a' } as never }), con).frase).toBe('Del texto')
  })
  it('botón por defecto Consultanos o el elegido', () => {
    expect(textosCopiaFiel(fila({ diseno: { cta: 'Vení a verla' } }), con).cta).toBe('Vení a verla')
  })
  it('negocio solo cuando no hay logo dibujable', () => {
    expect(textosCopiaFiel(fila(), con).negocio).toBeNull()
    const sin = textosCopiaFiel(fila(), { negocio: 'Benelli Store Quilmes', logoDibujable: false })
    expect(sin.negocio).toBe('Benelli Store Quilmes')
    expect(sin.logo).toBe('nombre')
  })
  it('sin logo y sin nombre => ningún logo', () => {
    expect(textosCopiaFiel(fila(), { negocio: '', logoDibujable: false }).logo).toBe('ninguno')
  })

  describe('ocultos (sacar textos de la placa)', () => {
    it('un texto sacado queda en null y figura en ocultos, en orden canónico', () => {
      const t = textosCopiaFiel(fila({ diseno: { ocultos: ['lugar', 'precio', 'modelo'] } }), con)
      expect(t).toMatchObject({ modelo: null, precio: null, lugar: null, ocultos: ['modelo', 'precio', 'lugar'] })
      expect(t.frase).toBe('Tu próxima moto')
    })
    it('frase, condición y botón sacados', () => {
      const t = textosCopiaFiel(fila({ diseno: { ocultos: ['frase', 'condicion', 'cta'] } }), con)
      expect(t).toMatchObject({ frase: null, condicion: null, cta: null, ocultos: ['frase', 'condicion', 'cta'] })
    })
    it('sacar los logos: ni logo ni nombre del negocio', () => {
      const t = textosCopiaFiel(fila({ diseno: { ocultos: ['logo999', 'logoConcesionaria'] } }), { negocio: 'Benelli', logoDibujable: false })
      expect(t).toMatchObject({ logo: 'ninguno', negocio: null })
      expect(textosCopiaFiel(fila({ diseno: { ocultos: ['logoConcesionaria'] } }), con).logo).toBe('ninguno')
    })
    it('se puede sacar todo', () => {
      const t = textosCopiaFiel(fila({ diseno: { ocultos: ['modelo', 'frase', 'precio', 'condicion', 'cta', 'lugar', 'logo999', 'logoConcesionaria'] } }), con)
      expect(textosVisibles(t)).toEqual([])
      expect(t.logo).toBe('ninguno')
    })
    it('el hash cambia si se saca algo (hay que generar de nuevo)', () => {
      expect(hashTextos(textosCopiaFiel(fila({ diseno: { ocultos: ['lugar'] } }), con))).not.toBe(hashTextos(textosCopiaFiel(fila(), con)))
    })
  })
})

describe('limpiarTextoPrompt', () => {
  it('quita los delimitadores «», las comillas, los saltos y los controles', () => {
    expect(limpiarTextoPrompt('Hola «mundo» "x" “y” ‘z’\nlinea\t2\u0000')).toBe('Hola mundo x y z linea 2')
  })
  it('colapsa espacios y recorta a 60', () => {
    expect(limpiarTextoPrompt('  a    b  ')).toBe('a b')
    expect(limpiarTextoPrompt('x'.repeat(100))).toHaveLength(60)
  })
})

describe('hashTextos', () => {
  it('es estable y distingue cualquier cambio', () => {
    const a = textosCopiaFiel(fila(), con)
    expect(hashTextos(a)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashTextos(a)).toBe(hashTextos(textosCopiaFiel(fila(), con)))
    expect(hashTextos(textosCopiaFiel(fila({ modelo: 'ROUSER 250' }), con))).not.toBe(hashTextos(a))
    expect(hashTextos(textosCopiaFiel(fila({ datos: { ...datosDePrueba(), precio: { moneda: 'ARS', monto: 4_500_001 } } }), con))).not.toBe(hashTextos(a))
  })
})

describe('textosVisibles', () => {
  it('la línea de lo que se va a pedir, en orden', () => {
    expect(textosVisibles(textosCopiaFiel(fila(), con))).toEqual(['ROUSER 200', '$ 4.500.000', '12 CUOTAS SIN INTERÉS', 'Tu próxima moto', 'Consultanos', 'Quilmes'])
  })
  it('incluye el nombre del negocio cuando se escribe y saltea lo sacado', () => {
    const t = textosCopiaFiel(fila({ diseno: { ocultos: ['precio'] } }), { negocio: 'Benelli', logoDibujable: false })
    expect(textosVisibles(t)).toEqual(['ROUSER 200', '12 CUOTAS SIN INTERÉS', 'Tu próxima moto', 'Consultanos', 'Quilmes', 'Benelli'])
  })
})
