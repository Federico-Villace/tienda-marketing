import { describe, it, expect } from 'vitest'
import { ajustarDiseno, dibujaFraseEnMayusculas, METRICAS, PRECIO_OCULTO } from '../diseno/ajuste'
import { resolverDiseno } from '../diseno/defaults'
import { prepararDiseno } from '../diseno/preparar'
import { validarDiseno } from '../diseno/validar'
import { acentosDe, ACENTOS_DE, BASE } from '../diseno/paletas'
import { PLANTILLAS_DISENO } from '../diseno/catalogo'
import { CTAS, INCLINACION_POR_DEFECTO, VARIACIONES_POR_PLANTILLA } from '../diseno/tipos'
import { FUENTE_POR_DEFECTO, FUENTES_POR_ROL, fuentesDe, ROLES_TEXTO, type IdFuente } from '../fuentes-placa'
import { combinacionValida, esPlantillaDiseno, IDS_PLANTILLA_DISENO, zonaDe, type DatosPromocion } from '../tipos'
import { ErrorTextoLargo, type TextosPlaca } from '../plantillas'
import { layoutReferencia } from './layout'
import { MINIMOS } from './reparar'
import { colorAcentoReferencia, tonoDeReferencia } from './acento'
import { plantillaDePrueba, zona } from './fixture'
import type { PlantillaReferencia } from './tipos'
import { ratioContraste } from './contraste'

const datos: DatosPromocion = { precio: { moneda: 'ARS', monto: 4_500_000 }, promo: { tipo: 'cuotas', detalle: '12 cuotas sin interés' }, lugar: 'Quilmes', indicaciones: '' }
const textos = (o: Partial<TextosPlaca> = {}): TextosPlaca => ({ marca: 'Benelli', modelo: 'TRK 502 X', precio: '$ 4.500.000', promo: '12 cuotas sin interés', titular: 'Tu próxima aventura', extra: '', lugar: 'Quilmes', ...o })
const ref = (): PlantillaReferencia => plantillaDePrueba('4:5')!
const ctx = { datos, logosMarca: ['vespa'] }

describe("'referencia' como plantilla de diseño", () => {
  it('es una de las de diseño, con la moto al centro y zona "marco"', () => {
    expect(IDS_PLANTILLA_DISENO).toContain('referencia')
    expect(esPlantillaDiseno('referencia')).toBe(true)
    expect(zonaDe('referencia', 'izquierda')).toBe('marco')
    expect(combinacionValida('referencia', 'centro')).toBe(true)
    expect(combinacionValida('referencia', 'izquierda')).toBe(false)
  })
  it('todos los Records por plantilla la tienen', () => {
    expect(VARIACIONES_POR_PLANTILLA.referencia).toBe(2)
    expect(FUENTE_POR_DEFECTO.referencia).toBeDefined()
    expect(INCLINACION_POR_DEFECTO.referencia).toEqual({ modelo: 0, frase: 0, precio: 0 })
    expect(BASE.referencia).toBeDefined()
    expect(PLANTILLAS_DISENO.referencia.nombre).toBeTruthy()
    for (const rol of ROLES_TEXTO) expect(FUENTES_POR_ROL[rol]).toContain(FUENTE_POR_DEFECTO.referencia![rol])
  })
  it('acento: "original" primero y los cinco de siempre', () => {
    expect(acentosDe('referencia')).toEqual(['original', 'azul', 'verde', 'rojo', 'naranja', 'amarillo'])
    expect(Object.keys(ACENTOS_DE.referencia)).toContain('original')
  })
  it('el servidor carga las fuentes base y las elegidas', () => {
    expect(fuentesDe('referencia')).toEqual(['barlow-condensed', 'sora-semibold'])
    expect(fuentesDe('referencia', { modelo: 'anton', precio: 'teko' })).toEqual(['barlow-condensed', 'sora-semibold', 'anton', 'teko'])
  })
  it('la frase se dibuja tal cual (como la impactante), no en mayúsculas', () => {
    expect(dibujaFraseEnMayusculas('referencia', 'oswald')).toBe(false)
  })
})

describe('colorAcentoReferencia y tonoDeReferencia', () => {
  it('"original" es el acento leído, con letra legible encima', () => {
    const p = { ...ref(), acento: '#E4FF1A' }
    const c = colorAcentoReferencia(p, 'original')
    expect(c.hex).toBe('#E4FF1A')
    expect(ratioContraste(c.sobre, c.hex)).toBeGreaterThanOrEqual(4.5)
  })
  it('los otros acentos son los de la paleta de siempre', () => {
    expect(colorAcentoReferencia(ref(), 'rojo').hex).toBe(ACENTOS_DE.referencia.rojo!.hex)
  })
  it('el tono sale del color del fondo (el del medio si es degradé)', () => {
    const base = ref()
    expect(tonoDeReferencia({ ...base, fondo: { tipo: 'liso', color: '#0B0B0D', color2: null, direccion: 'vertical' } })).toBe('oscuro')
    expect(tonoDeReferencia({ ...base, fondo: { tipo: 'liso', color: '#F3EBDD', color2: null, direccion: 'vertical' } })).toBe('claro')
    expect(tonoDeReferencia({ ...base, fondo: { tipo: 'degradado', color: '#000000', color2: '#FFFFFF', direccion: 'vertical' } })).toBe('claro')
  })
})

describe('validarDiseno · referencia', () => {
  const v = (x: unknown) => validarDiseno(x, 'referencia', ctx)
  it('admite acento (incluido original), precio, condición, CTA, frase, tamaños, fuentes, inclinación, variación 0..1 y logo de marca', () => {
    const r = v({ acento: 'original', mostrarPrecio: false, condicion: { texto: '12 CUOTAS', destacado: 'SIN INTERÉS' }, cta: CTAS[0], frase: 'Tu próxima aventura', tamanos: { modelo: 1 }, fuentes: { modelo: 'teko' }, inclinacion: { frase: 5 }, variacion: 1, logoMarca: 'vespa' })
    expect(r.ok).toBe(true)
  })
  it('NO admite lista, número ni posición de la frase', () => {
    for (const x of [{ lista: ['a'] }, { numero: '12' }, { posicionFrase: 'derecha' }]) expect(v(x).ok, JSON.stringify(x)).toBe(false)
  })
  it('la variación 2 no existe', () => {
    expect(v({ variacion: 2 }).ok).toBe(false)
    expect(v({ variacion: 0 }).ok).toBe(true)
  })
  it('sigue rechazando montos, contactos y claves desconocidas, igual que las demás', () => {
    expect(v({ frase: 'Hoy $ 1.000' }).ok).toBe(false)
    expect(v({ cta: 'Llamá al 1155551234' }).ok).toBe(false)
    expect(v({ layout: { modelo: { x: 1 } } }).ok).toBe(false)
  })
  it('"original" no vale en las otras plantillas', () => {
    expect(validarDiseno({ acento: 'original' }, 'editorial', ctx).ok).toBe(false)
  })
})

describe('resolverDiseno · referencia', () => {
  it('toma fuentes e inclinación de lo leído y el acento "original"', () => {
    const p = ref()
    const d = resolverDiseno(null, 'referencia', { modelo: 'TRK', titular: 'Tu próxima aventura', datos }, p)
    expect(d.fuentes).toEqual({ modelo: p.modelo.fuente, frase: p.frase!.fuente, precio: p.precio.fuente })
    expect(d.inclinacion).toEqual({ modelo: p.modelo.inclinacion, frase: p.frase!.inclinacion, precio: 0 })
    expect(d.acento).toBe('original')
  })
  it('lo que la persona eligió pisa lo leído', () => {
    const p = ref()
    const d = resolverDiseno({ fuentes: { modelo: 'teko' }, inclinacion: { modelo: 10 }, acento: 'rojo' }, 'referencia', { modelo: 'TRK', titular: 'x', datos }, p)
    expect(d.fuentes.modelo).toBe('teko')
    expect(d.inclinacion.modelo).toBe(10)
    expect(d.acento).toBe('rojo')
  })
  it('sin la lectura usa los valores estáticos de la plantilla', () => {
    const d = resolverDiseno(null, 'referencia', { modelo: 'TRK', titular: 'x', datos })
    expect(d.fuentes).toEqual(FUENTE_POR_DEFECTO.referencia)
  })
  it('las otras plantillas no cambian', () => {
    expect(resolverDiseno(null, 'impactante_textura', { modelo: 'TRK', titular: 'x', datos }).inclinacion.frase).toBe(-6)
  })
})

describe('prepararDiseno · referencia', () => {
  const base = { plantilla: 'referencia' as const, formato: '4:5' as const, textos: textos(), guardado: null, datos }
  it('arma diseño, layout elástico y ajuste con la lectura', () => {
    const p = prepararDiseno({ ...base, referencia: ref() })
    expect(p.layout.alto).toBe(1350)
    expect(p.layout.cajas.escena).toEqual(ref().moto)
    expect(p.ajuste.textoPrecio).toBe('$ 4.500.000')
    expect(p.diseno.acento).toBe('original')
  })
  it('otro formato recoloca sin tocar los textos', () => {
    const a = prepararDiseno({ ...base, referencia: ref() })
    const b = prepararDiseno({ ...base, formato: '9:16', referencia: ref() })
    expect(b.layout.alto).toBe(1920)
    expect(b.diseno).toEqual(a.diseno)
  })
  it('la variación 1 espeja el layout', () => {
    const a = prepararDiseno({ ...base, referencia: ref() })
    const b = prepararDiseno({ ...base, guardado: { variacion: 1 }, referencia: ref() })
    expect(b.layout.cajas.modelo.x).toBe(1080 - a.layout.cajas.modelo.x - a.layout.cajas.modelo.w)
  })
  it('sin la lectura lanza un error claro (no dibuja a ciegas)', () => {
    expect(() => prepararDiseno(base)).toThrow(/referencia/i)
  })
  it('un texto que no entra lanza ErrorTextoLargo', () => {
    expect(() => prepararDiseno({ ...base, referencia: ref(), textos: textos({ modelo: 'X'.repeat(120) }) })).toThrow(ErrorTextoLargo)
  })
  it('sin condición cargada no se reserva lugar para ella; con condición sí', () => {
    const p = plantillaDePrueba('4:5', { condicion: null })!
    const sin = prepararDiseno({ ...base, referencia: p, guardado: { condicion: { texto: '', destacado: '' } } })
    expect(sin.ajuste.filasCondicion).toBe(0)
    const con = prepararDiseno({ ...base, referencia: p })
    expect(con.ajuste.filasCondicion).toBeGreaterThan(0)
  })
})

describe('ajustarDiseno · zonas ausentes', () => {
  it('sin frase, sin condición y sin pie nada se dibuja (y nada falla)', () => {
    const p = plantillaDePrueba('4:5', { frase: null, condicion: null, cta: null })!
    const lay = layoutReferencia(p, '4:5', 0, { condicion: false, cta: false })
    const d = resolverDiseno(null, 'referencia', { modelo: 'TRK 502 X', titular: 'Tu próxima aventura', datos }, p)
    const a = ajustarDiseno(textos(), d, lay, 'referencia')
    expect(a.frase.lineas).toBe(0)
    expect(a.filasCondicion).toBe(0)
    expect(a.ctaTam).toBe(0)
    expect(a.lugarTam).toBe(0)
  })
  it('el pie angosto: el CTA entra a lo ancho de su caja y el lugar solo si sobra lugar', () => {
    const p = ref()
    const lay = layoutReferencia(p, '4:5', 0)
    const d = resolverDiseno({ cta: 'Escribinos por WhatsApp' }, 'referencia', { modelo: 'TRK', titular: 'x', datos }, p)
    const a = ajustarDiseno(textos(), d, lay, 'referencia')
    expect(a.ctaAncho).toBeLessThanOrEqual(lay.cajas.pie.w)
    expect(a.ctaTam).toBeGreaterThan(0)
    expect(a.lugarTam === 0 || a.lugarTam >= 22).toBe(true)
  })
  it('PRECIO_OCULTO también entra', () => {
    const p = ref()
    const lay = layoutReferencia(p, '4:5', 0)
    const d = resolverDiseno({ mostrarPrecio: false }, 'referencia', { modelo: 'TRK', titular: 'x', datos }, p)
    expect(ajustarDiseno(textos(), d, lay, 'referencia').textoPrecio).toBe(PRECIO_OCULTO)
  })
  it('una inclinación distinta de 0 se verifica siempre contra la caja (también la leída)', () => {
    const p = { ...ref(), modelo: { ...ref().modelo, inclinacion: 10 } }
    const lay = layoutReferencia(p, '4:5', 0)
    const d = resolverDiseno(null, 'referencia', { modelo: 'TRK 502 X', titular: 'x', datos }, p)
    const a = ajustarDiseno(textos(), d, lay, 'referencia')
    const sinGirar = ajustarDiseno(textos(), resolverDiseno({ inclinacion: { modelo: 0 } }, 'referencia', { modelo: 'TRK 502 X', titular: 'x', datos }, p), lay, 'referencia')
    expect(a.modelo.tam).toBeLessThanOrEqual(sinGirar.modelo.tam)
  })
})

/**
 * LA GARANTÍA: con las cajas en su MÍNIMO (lo peor que puede entregar la reparación) el texto más largo que se prueba
 * entra con CUALQUIER fuente elegible de su rol. Si esto falla hay que subir MINIMOS en reparar.ts.
 */
describe('garantía de ajuste con las cajas mínimas y cualquier fuente del rol', () => {
  const minima = (): PlantillaReferencia => {
    const caja = (x: number, y: number, m: { w: number; h: number }) => ({ x, y, ...m })
    return {
      ...ref(),
      moto: { x: 108, y: 400, w: 864, h: 540 },
      modelo: { ...ref().modelo, caja: caja(48, 60, MINIMOS.modelo), inclinacion: 0 },
      precio: { ...ref().precio, caja: caja(48, 1000, MINIMOS.precio), estilo: 'texto', relleno: null },
      condicion: { caja: caja(560, 1000, MINIMOS.condicion), color: '#FFFFFF', fuente: 'sora-semibold', alineacion: 'izquierda' },
      frase: { ...ref().frase!, caja: caja(48, 200, MINIMOS.frase), inclinacion: 0 },
      cta: { caja: caja(48, 1120, MINIMOS.cta), color: '#FFFFFF', relleno: '#E11D2E' },
      logos: [caja(48, 1220, MINIMOS.logo)],
    }
  }
  const MODELOS = ['TRK 502', 'Street Triple 765', 'Ninja ZX-6R ABS']
  const FRASES = ['Tu próxima aventura', 'Rompé la rutina']
  const PRECIOS = ['$ 4.500.000', 'US$ 12.000', '$ 18.990.000']

  for (const rol of ROLES_TEXTO) {
    it(`${rol}: toda fuente de la lista entra en la caja mínima`, () => {
      const p = minima()
      const lay = layoutReferencia(p, '4:5', 0)
      for (const fuente of FUENTES_POR_ROL[rol] as readonly IdFuente[]) {
        for (const valor of rol === 'modelo' ? MODELOS : rol === 'frase' ? FRASES : PRECIOS) {
          const t = textos(rol === 'modelo' ? { modelo: valor } : rol === 'frase' ? { titular: valor } : { precio: valor })
          const d = resolverDiseno({ fuentes: { [rol]: fuente } }, 'referencia', { modelo: t.modelo, titular: t.titular, datos }, p)
          expect(() => ajustarDiseno(t, d, lay, 'referencia'), `${rol} ${fuente} "${valor}"`).not.toThrow()
        }
      }
    })
  }
  it('el precio oculto ("CONSULTÁ PRECIO") entra con toda fuente de precio', () => {
    const p = minima()
    const lay = layoutReferencia(p, '4:5', 0)
    for (const fuente of FUENTES_POR_ROL.precio) {
      const d = resolverDiseno({ fuentes: { precio: fuente }, mostrarPrecio: false }, 'referencia', { modelo: 'TRK', titular: 'x', datos }, p)
      expect(() => ajustarDiseno(textos(), d, lay, 'referencia'), fuente).not.toThrow()
    }
  })
  it('la condición de siempre y cada CTA entran en sus cajas mínimas', () => {
    const p = minima()
    const lay = layoutReferencia(p, '4:5', 0)
    for (const cta of CTAS) {
      const d = resolverDiseno({ cta }, 'referencia', { modelo: 'TRK', titular: 'x', datos }, p)
      const a = ajustarDiseno(textos(), d, lay, 'referencia')
      expect(a.ctaAncho, cta).toBeLessThanOrEqual(lay.cajas.pie.w)
      expect(a.condicionTam).toBeGreaterThanOrEqual(24)
    }
  })
  it('el tamaño +2 tampoco rompe las cajas mínimas', () => {
    const p = minima()
    const lay = layoutReferencia(p, '4:5', 0)
    for (const rol of ROLES_TEXTO) for (const fuente of FUENTES_POR_ROL[rol]) {
      const t = textos({ modelo: 'Ninja ZX-6R ABS', precio: '$ 18.990.000', titular: 'Tu próxima aventura' })
      const d = resolverDiseno({ fuentes: { [rol]: fuente }, tamanos: { [rol]: 2 } }, 'referencia', { modelo: t.modelo, titular: t.titular, datos }, p)
      const a = ajustarDiseno(t, d, lay, 'referencia')
      expect(a[rol].lineas * a[rol].tam * METRICAS[fuente].linea, `${rol} ${fuente}`).toBeLessThanOrEqual(lay.cajas[rol].h + 0.5)
    }
  })
  it('y en los otros dos formatos y la variación espejada también', () => {
    for (const f of ['1:1', '9:16'] as const) for (const v of [0, 1]) {
      const lay = layoutReferencia(ref(), f, v)
      for (const rol of ROLES_TEXTO) for (const fuente of FUENTES_POR_ROL[rol]) {
        const d = resolverDiseno({ fuentes: { [rol]: fuente } }, 'referencia', { modelo: 'Ninja ZX-6R ABS', titular: 'Tu próxima aventura', datos }, ref())
        expect(() => ajustarDiseno(textos({ modelo: 'Ninja ZX-6R ABS', precio: '$ 18.990.000' }), d, lay, 'referencia'), `${f}/${v} ${rol} ${fuente}`).not.toThrow()
      }
    }
  })
})
void zona
