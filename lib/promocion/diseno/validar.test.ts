import { describe, it, expect } from 'vitest'
import { sinVariacionFueraDeRango, validarDiseno } from './validar'
import { MENSAJE_MONTOS } from '../montos-placa'
import type { DatosPromocion } from '../tipos'

const datos: DatosPromocion = { precio: { moneda: 'ARS', monto: 4_500_000 }, promo: { tipo: 'cuotas', detalle: '12 cuotas sin interés' }, lugar: 'Quilmes', indicaciones: '' }
const ctx = { datos, logosMarca: ['moto-guzzi', 'vespa'] }
const ok = (x: unknown, p: Parameters<typeof validarDiseno>[1] = 'impactante_textura') => validarDiseno(x, p, ctx)
const errores = (x: unknown, p: Parameters<typeof validarDiseno>[1] = 'impactante_textura') => {
  const r = ok(x, p)
  if (r.ok) throw new Error('debería fallar')
  return r.errores.join(' | ')
}

describe('validarDiseno (R2): el servidor es la autoridad', () => {
  it('null o vacío = defaults', () => {
    expect(ok(null)).toEqual({ ok: true, diseno: null })
    expect(ok({})).toEqual({ ok: true, diseno: null })
  })

  it('acepta un diseño completo válido y lo devuelve normalizado', () => {
    const r = ok({
      acento: 'rojo',
      mostrarPrecio: false,
      condicion: { texto: '12 CUOTAS', destacado: 'SIN INTERÉS' },
      cta: 'Consultanos',
      frase: 'Tu próxima aventura',
      tamanos: { modelo: 1, frase: -1, precio: 0 },
      posicionFrase: 'derecha',
      logoMarca: 'vespa',
    })
    expect(r).toEqual({
      ok: true,
      diseno: {
        acento: 'rojo',
        mostrarPrecio: false,
        condicion: { texto: '12 CUOTAS', destacado: 'SIN INTERÉS' },
        cta: 'Consultanos',
        frase: 'Tu próxima aventura',
        tamanos: { modelo: 1, frase: -1, precio: 0 },
        posicionFrase: 'derecha',
        logoMarca: 'vespa',
      },
    })
  })

  it('no es un objeto → error', () => {
    expect(errores('rojo')).toMatch(/objeto/)
    expect(errores([])).toMatch(/objeto/)
  })

  it('clave desconocida → "no está permitido"', () => {
    expect(errores({ colorFondo: '#fff' })).toMatch(/"colorFondo" no está permitido/)
  })

  describe('acento: solo los de ESA plantilla', () => {
    it('verde no existe en editorial', () => {
      expect(errores({ acento: 'verde' }, 'editorial')).toMatch(/acento/)
      expect(ok({ acento: 'naranja' }, 'editorial').ok).toBe(true)
    })
    it('rojo no existe en deportiva; amarillo sí', () => {
      expect(errores({ acento: 'rojo' }, 'deportiva')).toMatch(/acento/)
      expect(ok({ acento: 'amarillo' }, 'deportiva').ok).toBe(true)
    })
    it('un color en hex libre no vale', () => {
      expect(errores({ acento: '#ff0000' })).toMatch(/acento/)
    })
  })

  it('cta: solo de la lista cerrada', () => {
    expect(errores({ cta: 'Comprá ya, $1' })).toMatch(/cta/)
    for (const c of ['Consultanos', 'Escribinos por WhatsApp', 'Pedí tu test ride', 'Vení a verla']) expect(ok({ cta: c }).ok).toBe(true)
  })

  it('mostrarPrecio tiene que ser true o false', () => {
    expect(errores({ mostrarPrecio: 'no' })).toMatch(/mostrarPrecio/)
  })

  describe('condicion', () => {
    it('un monto de dinero en destacado o texto → MENSAJE_MONTOS', () => {
      expect(errores({ condicion: { texto: '12 CUOTAS', destacado: '$ 500.000' } })).toContain(MENSAJE_MONTOS)
      expect(errores({ condicion: { texto: 'USD 9.000', destacado: '' } })).toContain(MENSAJE_MONTOS)
    })
    it('el precio cargado SÍ está respaldado (mismo criterio que la línea extra)', () => {
      expect(ok({ condicion: { texto: 'DESDE $ 4.500.000', destacado: '' } }).ok).toBe(true)
    })
    it('largos: texto ≤22, destacado ≤18', () => {
      expect(errores({ condicion: { texto: 'a'.repeat(23), destacado: '' } })).toMatch(/condicion\.texto/)
      expect(errores({ condicion: { texto: 'ok', destacado: 'a'.repeat(19) } })).toMatch(/condicion\.destacado/)
      expect(ok({ condicion: { texto: 'a'.repeat(22), destacado: 'b'.repeat(18) } }).ok).toBe(true)
    })
    it('sin emojis ni teléfonos ni emails', () => {
      expect(errores({ condicion: { texto: '12 CUOTAS 🔥', destacado: '' } })).toMatch(/emojis/)
      expect(errores({ condicion: { texto: 'LLAMÁ 11 5555 4444', destacado: '' } })).toMatch(/teléfonos/)
      expect(errores({ condicion: { texto: 'a@b.com', destacado: '' } })).toMatch(/teléfonos/)
    })
    it('claves sobrantes o faltantes', () => {
      expect(errores({ condicion: { texto: 'x', destacado: '', extra: 'y' } })).toMatch(/condicion\.extra/)
      expect(errores({ condicion: { texto: 'x' } })).toMatch(/condicion\.destacado/)
    })
  })

  describe('frase (≤28, mismas reglas que el titular)', () => {
    it('largo, emojis y montos', () => {
      expect(errores({ frase: 'a'.repeat(29) })).toMatch(/frase/)
      expect(errores({ frase: 'Hoy 🔥' })).toMatch(/emojis/)
      expect(errores({ frase: 'Llevatela por $ 1.000.000' })).toContain(MENSAJE_MONTOS)
      expect(ok({ frase: 'a'.repeat(28) }).ok).toBe(true)
    })
    it('null = usar el titular (no se guarda)', () => {
      expect(ok({ frase: null })).toEqual({ ok: true, diseno: null })
    })
  })

  describe('lista (solo editorial: hasta 3 palabras ≤14)', () => {
    it('más de 3 o más largas → error', () => {
      expect(errores({ lista: ['a', 'b', 'c', 'd'] }, 'editorial')).toMatch(/lista/)
      expect(errores({ lista: ['a'.repeat(15)] }, 'editorial')).toMatch(/lista/)
      expect(ok({ lista: ['ABS', 'Bluetooth', 'LED'] }, 'editorial').ok).toBe(true)
    })
    it('sin montos ni emojis en la lista', () => {
      expect(errores({ lista: ['$ 900.000'] }, 'editorial')).toContain(MENSAJE_MONTOS)
      expect(errores({ lista: ['🔥'] }, 'editorial')).toMatch(/emojis/)
    })
    it('no existe en las otras plantillas', () => {
      expect(errores({ lista: ['ABS'] }, 'deportiva')).toMatch(/lista/)
    })
  })

  describe('numero (solo editorial, ≤4 letras o dígitos)', () => {
    it('≤4 alfanuméricos', () => {
      expect(ok({ numero: '251' }, 'editorial').ok).toBe(true)
      expect(errores({ numero: '12345' }, 'editorial')).toMatch(/numero/)
      expect(errores({ numero: '2 5' }, 'editorial')).toMatch(/numero/)
      expect(errores({ numero: '251' }, 'impactante_textura')).toMatch(/numero/)
    })
  })

  describe('tamanos', () => {
    it('enteros de −2 a +2', () => {
      expect(errores({ tamanos: { modelo: 3 } })).toMatch(/tamanos\.modelo/)
      expect(errores({ tamanos: { frase: -3 } })).toMatch(/tamanos\.frase/)
      expect(errores({ tamanos: { precio: 0.5 } })).toMatch(/tamanos\.precio/)
      expect(errores({ tamanos: { alto: 1 } })).toMatch(/tamanos\.alto/)
      expect(ok({ tamanos: { modelo: 2, precio: -2 } }).ok).toBe(true)
    })
  })

  it('posicionFrase: izquierda o derecha, y solo donde hay frase suelta', () => {
    expect(errores({ posicionFrase: 'centro' })).toMatch(/posicionFrase/)
    expect(errores({ posicionFrase: 'izquierda' }, 'editorial')).toMatch(/posicionFrase/)
    expect(ok({ posicionFrase: 'izquierda' }, 'deportiva').ok).toBe(true)
  })

  describe('logoMarca', () => {
    it('tiene que existir en el manifiesto de la concesionaria', () => {
      expect(errores({ logoMarca: 'ducati' })).toMatch(/logoMarca/)
      expect(ok({ logoMarca: 'moto-guzzi' }).ok).toBe(true)
    })
    it('null = sin logo de marca', () => {
      expect(ok({ logoMarca: null })).toEqual({ ok: true, diseno: { logoMarca: null } })
    })
  })

  describe('fuentes: lista cerrada POR ROL (modelo, frase, precio)', () => {
    it('acepta una fuente de la lista de cada rol y la devuelve tal cual', () => {
      const r = ok({ fuentes: { modelo: 'bebas-neue', frase: 'pacifico', precio: 'oswald' } })
      expect(r).toEqual({ ok: true, diseno: { fuentes: { modelo: 'bebas-neue', frase: 'pacifico', precio: 'oswald' } } })
    })
    it('una fuente que no existe → error', () => {
      expect(errores({ fuentes: { modelo: 'comic-sans' } })).toMatch(/fuentes\.modelo/)
    })
    it('una fuente de OTRO rol → error: Bebas Neue no tiene minúsculas, no va en la frase; Pacifico no va en el modelo', () => {
      expect(errores({ fuentes: { frase: 'bebas-neue' } })).toMatch(/fuentes\.frase/)
      expect(errores({ fuentes: { modelo: 'pacifico' } })).toMatch(/fuentes\.modelo/)
      expect(errores({ fuentes: { precio: 'black-ops-one' } })).toMatch(/fuentes\.precio/)
    })
    it('una fuente interna (inter) o algo que no es texto → error', () => {
      expect(errores({ fuentes: { precio: 'inter' } })).toMatch(/fuentes\.precio/)
      expect(errores({ fuentes: { modelo: 5 } })).toMatch(/fuentes\.modelo/)
      expect(errores({ fuentes: { modelo: { x: 1 } } })).toMatch(/fuentes\.modelo/)
    })
    it('un rol desconocido o un no-objeto → error', () => {
      expect(errores({ fuentes: { condicion: 'anton' } })).toMatch(/fuentes\.condicion/)
      expect(errores({ fuentes: 'anton' })).toMatch(/fuentes/)
      expect(errores({ fuentes: ['anton'] })).toMatch(/fuentes/)
    })
    it('vale en las tres plantillas (las fuentes no dependen de la plantilla)', () => {
      for (const p of ['impactante_textura', 'deportiva', 'editorial'] as const) expect(ok({ fuentes: { modelo: 'teko' } }, p).ok).toBe(true)
    })
  })

  describe('inclinacion: solo -10, -5, 0, 5 o 10 grados', () => {
    it('acepta cada valor permitido en cada rol', () => {
      for (const g of [-10, -5, 0, 5, 10]) expect(ok({ inclinacion: { modelo: g, frase: g, precio: g } }).ok).toBe(true)
    })
    it('cualquier otro número → error (incluido el -6 de fábrica de la frase de la impactante: se elige "Original" quitando la clave)', () => {
      for (const g of [-6, 1, 7, 15, -15, 0.5, 100]) expect(errores({ inclinacion: { frase: g } }), String(g)).toMatch(/inclinacion\.frase/)
    })
    it('un texto, NaN, Infinity o null → error', () => {
      for (const g of ['5', Number.NaN, Infinity, null, true]) expect(errores({ inclinacion: { modelo: g } })).toMatch(/inclinacion\.modelo/)
    })
    it('rol desconocido o no-objeto → error', () => {
      expect(errores({ inclinacion: { cta: 5 } })).toMatch(/inclinacion\.cta/)
      expect(errores({ inclinacion: 5 })).toMatch(/inclinacion/)
    })
  })

  describe('variacion: entero de 0 a N-1 de ESA plantilla', () => {
    it('0, 1 y 2 valen (cada plantilla tiene 3)', () => {
      for (const p of ['impactante_textura', 'deportiva', 'editorial'] as const) for (const v of [0, 1, 2]) expect(ok({ variacion: v }, p).ok).toBe(true)
    })
    it('3, -1, decimales, texto o NaN → error', () => {
      for (const v of [3, -1, 1.5, '1', Number.NaN, null, 99]) expect(errores({ variacion: v })).toMatch(/variacion/)
    })
    it('la variación 0 se conserva (es un valor válido, no "ausente")', () => {
      expect(ok({ variacion: 0 })).toEqual({ ok: true, diseno: { variacion: 0 } })
    })
  })

  it('acumula todos los errores', () => {
    const r = ok({ acento: 'x', cta: 'y' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.length).toBe(2)
  })
})

describe('sinVariacionFueraDeRango (al cambiar de plantilla)', () => {
  it('conserva una variación que existe en la plantilla nueva y no toca el resto', () => {
    expect(sinVariacionFueraDeRango({ variacion: 2, cta: 'Consultanos' }, 'editorial')).toEqual({ variacion: 2, cta: 'Consultanos' })
  })
  it('descarta la variación que no existe en la nueva (según cuántas tenga), conservando lo demás', () => {
    expect(sinVariacionFueraDeRango({ variacion: 2, cta: 'Consultanos' }, 'editorial', 2)).toEqual({ cta: 'Consultanos' })
    expect(sinVariacionFueraDeRango({ variacion: 5 }, 'deportiva')).toEqual({})
  })
  it('sin variación devuelve lo mismo', () => {
    const d = { cta: 'Consultanos' as const }
    expect(sinVariacionFueraDeRango(d, 'deportiva')).toEqual(d)
  })
})
