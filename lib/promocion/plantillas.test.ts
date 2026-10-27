import { describe, it, expect } from 'vitest'
import { ajustarTexto, ajustarTextos, ErrorTextoLargo, FUENTES, layoutDe, limitesTexto, MEDIDAS, medidasDe, ORDEN, PLANTILLAS, type TextosPlaca } from './plantillas'
import { IDS_PLANTILLA, POSICIONES_MOTO, posicionTextoDe, estiloDe } from './tipos'
import { ASPECTOS_FOTO, type AspectoFoto } from '../productor/ediciones'

const textos = (o: Partial<TextosPlaca> = {}): TextosPlaca => ({
  marca: 'Benelli Store Quilmes',
  modelo: 'TRK 502',
  precio: '$ 4.500.000',
  promo: '12 cuotas sin interés',
  titular: 'Tu próxima aventura',
  extra: 'Hot Sale · Solo este fin de semana',
  lugar: 'Quilmes',
  ...o,
})
const ASPECTOS = Object.keys(ASPECTOS_FOTO) as AspectoFoto[]

describe('MEDIDAS', () => {
  it('1080 de ancho en los tres formatos', () => {
    expect(MEDIDAS).toEqual({ '1:1': [1080, 1080], '4:5': [1080, 1350], '9:16': [1080, 1920] })
    expect(medidasDe('4:5')).toEqual({ ancho: 1080, alto: 1350 })
  })
  it('coinciden con los formatos del Productor', () => {
    expect(Object.keys(MEDIDAS)).toEqual(Object.keys(ASPECTOS_FOTO))
  })
})

describe('PLANTILLAS', () => {
  it('son las seis, con nombre y posición coherentes con su id', () => {
    expect(Object.keys(PLANTILLAS)).toEqual([...IDS_PLANTILLA])
    for (const id of IDS_PLANTILLA) {
      expect(PLANTILLAS[id].nombre).toBeTruthy()
      expect(PLANTILLAS[id].posicion).toBe(posicionTextoDe(id))
      expect(PLANTILLAS[id].estilo).toBe(estiloDe(id))
    }
  })
  it('catálogo es un panel liso y sugiere el fondo de estudio', () => {
    expect(PLANTILLAS.catalogo.estilo).toBe('solido')
    expect(PLANTILLAS.catalogo.fondoSugerido).toBe('fondo_estudio')
    expect(PLANTILLAS.oferta_abajo.estilo).toBe('degradado')
  })
})

describe('FUENTES', () => {
  it('Anton para el precio y el modelo; Inter SemiBold para el resto', () => {
    expect(FUENTES.titulo).toMatchObject({ nombre: 'Anton', archivo: 'Anton-Regular.ttf', peso: 400 })
    expect(FUENTES.texto).toMatchObject({ nombre: 'Inter', archivo: 'Inter-SemiBold.otf', peso: 600 })
  })
})

describe('layoutDe', () => {
  it('la banda ocupa una parte del alto y deja el resto a la foto', () => {
    for (const a of ASPECTOS) {
      const l = layoutDe('oferta_abajo', a)
      expect(l.ancho).toBe(1080)
      expect(l.bandaAlto).toBeGreaterThan(l.alto * 0.25)
      expect(l.bandaAlto).toBeLessThan(l.alto * 0.5)
      expect(l.padX).toBeGreaterThanOrEqual(48)
    }
  })
  it('la zona sale de la plantilla', () => {
    expect(layoutDe('oferta_arriba', '4:5').zona).toBe('arriba')
    expect(layoutDe('oferta_abajo', '4:5').zona).toBe('abajo')
  })
  it('al costado el bloque ocupa todo el alto y la mitad del ancho, del lado opuesto a la moto', () => {
    const der = layoutDe('oferta_costado', '4:5', 'izquierda')
    expect(der.zona).toBe('derecha')
    expect(der.bandaAlto).toBe(der.alto)
    expect(der.bandaAncho).toBe(540)
    expect(der.anchoTexto).toBe(540 - 2 * der.padX)
    expect(layoutDe('catalogo_costado', '1:1', 'derecha').zona).toBe('izquierda')
  })
  it('arriba y abajo la banda ocupa todo el ancho', () => {
    expect(layoutDe('oferta_abajo', '1:1').bandaAncho).toBe(1080)
  })
})

describe('ajustarTexto', () => {
  const o = { base: 100, min: 40, ancho: 1000, factor: 0.5, lineas: 1 }
  it('un texto corto queda en el tamaño base', () => {
    expect(ajustarTexto('Hola', o)).toEqual({ tam: 100, lineas: 1 })
  })
  it('un texto largo se achica hasta entrar', () => {
    const r = ajustarTexto('a'.repeat(30), o)!
    expect(r.tam).toBeLessThan(100)
    expect(r.tam).toBeGreaterThanOrEqual(40)
    expect(30 * r.tam * 0.5).toBeLessThanOrEqual(1000)
  })
  it('si no entra ni en el mínimo, devuelve null', () => {
    expect(ajustarTexto('a'.repeat(100), o)).toBeNull()
  })
  it('con dos líneas permitidas parte el texto antes de achicar', () => {
    expect(ajustarTexto('a'.repeat(50), { ...o, base: 60, lineas: 2 })).toEqual({ tam: 60, lineas: 2 })
    expect(ajustarTexto('a'.repeat(10), { ...o, base: 60, lineas: 2 })).toEqual({ tam: 60, lineas: 1 })
  })
  it('un texto vacío no ocupa lugar', () => {
    expect(ajustarTexto('', o)).toEqual({ tam: 100, lineas: 0 })
  })
})

describe('ajustarTextos', () => {
  it('un caso típico queda en tamaños sanos y legibles', () => {
    const a = ajustarTextos(textos(), 'oferta_abajo', '4:5')
    expect(a.precio.tam).toBeGreaterThanOrEqual(100)
    expect(a.modelo.tam).toBeGreaterThanOrEqual(60)
    expect(a.promo.lineas).toBe(1)
  })
  it('un modelo largo se achica', () => {
    const corto = ajustarTextos(textos(), 'oferta_abajo', '4:5')
    const largo = ajustarTextos(textos({ modelo: 'Leoncino 500 Trail Edición Limitada' }), 'oferta_abajo', '4:5')
    expect(largo.modelo.tam).toBeLessThan(corto.modelo.tam)
  })
  it('sin promoción no deja un hueco', () => {
    const a = ajustarTextos(textos({ promo: '' }), 'oferta_abajo', '4:5')
    expect(a.promo.lineas).toBe(0)
  })
  it('un texto que no entra ni achicado lanza un error en castellano que dice cuál', () => {
    const largo = 'a'.repeat(60)
    expect(() => ajustarTextos(textos({ modelo: largo }), 'oferta_abajo', '4:5')).toThrow(ErrorTextoLargo)
    expect(() => ajustarTextos(textos({ modelo: largo }), 'oferta_abajo', '4:5')).toThrow('El texto del modelo es muy largo para este diseño.')
    expect.assertions(4)
    try {
      ajustarTextos(textos({ lugar: 'z'.repeat(120) }), 'oferta_abajo', '4:5')
    } catch (e) {
      expect((e as ErrorTextoLargo).campo).toBe('lugar')
      expect((e as Error).message).toBe('El texto del lugar es muy largo para este diseño.')
    }
  })
  it('todo entra en la banda en los 18 diseños, aun con los textos más largos permitidos', () => {
    for (const id of IDS_PLANTILLA) {
      const lim = limitesTexto(posicionTextoDe(id))
      const peor = textos({
        marca: 'Benelli Store Quilmes',
        modelo: 'm'.repeat(20),
        precio: 'US$ 9.999.999',
        promo: 'p'.repeat(60),
        titular: 't'.repeat(lim.titular),
        extra: 'e'.repeat(lim.extra),
        lugar: 'l'.repeat(40),
      })
      for (const a of ASPECTOS) {
        for (const moto of POSICIONES_MOTO) {
          const l = layoutDe(id, a, moto)
          const aj = ajustarTextos(peor, id, a, moto)
          expect(aj.alturaTotal, `${id} ${a} ${moto}`).toBeLessThanOrEqual(l.bandaAlto - 2 * l.padY + 1)
        }
      }
    }
  })
  it('la línea extra va después del titular y es opcional', () => {
    expect(ORDEN.indexOf('extra')).toBe(ORDEN.indexOf('titular') + 1)
    expect(ajustarTextos(textos({ extra: '' }), 'oferta_abajo', '4:5').extra.lineas).toBe(0)
    expect(ajustarTextos(textos(), 'oferta_abajo', '4:5').extra.lineas).toBe(1)
  })
  it('una línea extra que no entra lanza el error que la nombra', () => {
    expect(() => ajustarTextos(textos({ extra: 'x'.repeat(200) }), 'oferta_abajo', '4:5')).toThrow('El texto de la línea extra es muy largo para este diseño.')
  })
  it('es determinístico: mismos textos, mismo ajuste', () => {
    expect(ajustarTextos(textos(), 'catalogo', '9:16')).toEqual(ajustarTextos(textos(), 'catalogo', '9:16'))
  })
})

describe('limitesTexto (contador de la pantalla)', () => {
  it('arriba y abajo hay más lugar que al costado', () => {
    expect(limitesTexto('abajo')).toEqual({ titular: 40, extra: 60 })
    expect(limitesTexto('arriba')).toEqual(limitesTexto('abajo'))
    expect(limitesTexto('costado')).toEqual({ titular: 28, extra: 36 })
  })
})
