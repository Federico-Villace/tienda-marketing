import { describe, it, expect } from 'vitest'
import { compararTextos, mensajeDiferencia, VERSION_COMPARACION } from './comparar'
import type { Lectura, MotoTexto, RolLeido, TextoLeido, TextosCopia } from './tipos'

const M1: MotoTexto = { modelo: 'ROUSER 200', precio: '$ 4.500.000', condicion: { texto: '12 CUOTAS', destacado: 'SIN INTERÉS' } }
const M2: MotoTexto = { modelo: 'LEONCINO 500', precio: '$ 7.000.000', condicion: { texto: 'CONTADO', destacado: '' } }
const M3: MotoTexto = { modelo: 'TRK 502', precio: '$ 9.200.000', condicion: null }

const esperado = (motos: MotoTexto[] = [M1, M2], o: Partial<TextosCopia> = {}): TextosCopia => ({
  motos,
  modelo: null,
  precio: null,
  condicion: null,
  frase: 'Elegí la tuya',
  cta: 'Consultanos',
  lugar: 'Quilmes',
  negocio: null,
  logo: 'real',
  ocultos: [],
  ...o,
})
const l = (texto: string, rol: RolLeido = 'otro', dudoso = false): TextoLeido => ({ texto, rol, dudoso })
const de = (m: MotoTexto): TextoLeido[] => [
  ...(m.modelo ? [l(m.modelo, 'modelo')] : []),
  ...(m.precio ? [l(m.precio, 'precio')] : []),
  ...(m.condicion ? [l(m.condicion.texto, 'condicion'), ...(m.condicion.destacado ? [l(m.condicion.destacado, 'condicion')] : [])] : []),
]
const COMUNES = [l('Elegí la tuya', 'frase'), l('CONSULTANOS', 'cta'), l('Quilmes', 'lugar')]
const BIEN = [...de(M1), ...de(M2), ...COMUNES]
const lectura = (textos: TextoLeido[]): Lectura => ({ textos, logo: null, fondoLogo: null })
const comparar = (textos: TextoLeido[], motos: MotoTexto[] = [M1, M2], o: Partial<TextosCopia> = {}) => compararTextos(esperado(motos, o), lectura(textos))
const difs = (textos: TextoLeido[], motos?: MotoTexto[], o?: Partial<TextosCopia>) => {
  const r = comparar(textos, motos, o)
  return r.ok ? [] : r.diferencias
}
const sin = (textos: TextoLeido[], ...quitar: string[]) => textos.filter((t) => !quitar.includes(t.texto))

describe('varias motos: lo bueno', () => {
  it('todo igual => ok sin avisos', () => {
    expect(comparar(BIEN)).toEqual({ ok: true, avisos: [] })
    expect(VERSION_COMPARACION).toBe('copia-comparacion-v1')
  })
  it('el orden en que se leyó no importa (el emparejamiento por posición no lo verifica el software)', () => {
    expect(comparar([...BIEN].reverse()).ok).toBe(true)
    expect(comparar([...de(M2), ...COMUNES, ...de(M1)]).ok).toBe(true)
  })
  it('cuatro motos', () => {
    const M4: MotoTexto = { modelo: 'ZS 125', precio: '$ 1.900.000', condicion: null }
    expect(comparar([...de(M1), ...de(M2), ...de(M3), ...de(M4), ...COMUNES], [M1, M2, M3, M4]).ok).toBe(true)
  })
  it('un modelo en dos renglones', () => {
    expect(comparar([l('LEONCINO', 'modelo'), l('500', 'modelo'), ...de(M1), l(M2.precio!, 'precio'), l('CONTADO', 'condicion'), ...COMUNES]).ok).toBe(true)
  })
})

describe('varias motos: cada precio esperado aparece exactamente una vez', () => {
  it('falta el precio de una moto => bloquea y dice de cuál', () => {
    expect(difs(sin(BIEN, '$ 7.000.000'))).toEqual([{ campo: 'precio', motivo: 'falta', esperado: '$ 7.000.000', leido: null, moto: 2 }])
  })
  it('falta el precio de la moto 1', () => {
    expect(difs(sin(BIEN, '$ 4.500.000'))).toEqual([{ campo: 'precio', motivo: 'falta', esperado: '$ 4.500.000', leido: null, moto: 1 }])
  })
  it('un precio con un dígito mal => distinto, de esa moto', () => {
    const t = BIEN.map((x) => (x.texto === '$ 7.000.000' ? l('$ 7.000.00', 'precio') : x))
    expect(difs(t)).toEqual([{ campo: 'precio', motivo: 'distinto', esperado: '$ 7.000.000', leido: '$ 7.000.00', moto: 2 }])
  })
  it('"US$" por "$" y separadores distintos => distinto', () => {
    expect(difs(BIEN.map((x) => (x.texto === '$ 7.000.000' ? l('US$ 7.000.000', 'precio') : x)))[0]).toMatchObject({ campo: 'precio', motivo: 'distinto', moto: 2 })
    expect(difs(BIEN.map((x) => (x.texto === '$ 4.500.000' ? l('$ 4,500,000', 'precio') : x)))[0]).toMatchObject({ campo: 'precio', motivo: 'distinto', moto: 1 })
  })
  it('un precio dudoso => ilegible', () => {
    expect(difs(BIEN.map((x) => (x.texto === '$ 7.000.000' ? l('$ 7.000.000', 'precio', true) : x)))).toEqual([{ campo: 'precio', motivo: 'ilegible', esperado: '$ 7.000.000', leido: '$ 7.000.000', moto: 2 }])
  })
  it('un precio que aparece DOS veces cuando se esperaba una => el segundo sobra y bloquea', () => {
    const d = difs([...BIEN, l('$ 4.500.000', 'precio')])
    expect(d).toEqual([{ campo: 'otro', motivo: 'sobra', esperado: null, leido: '$ 4.500.000' }])
  })
  it('un monto que nadie pidió bloquea', () => {
    expect(difs([...BIEN, l('$ 450.000', 'otro')])).toEqual([{ campo: 'otro', motivo: 'sobra', esperado: null, leido: '$ 450.000' }])
  })
  it('el espacio después del $ es opcional', () => {
    expect(comparar(BIEN.map((x) => (x.texto === '$ 7.000.000' ? l('$7.000.000', 'precio') : x))).ok).toBe(true)
  })
  describe('dos motos con el MISMO precio', () => {
    const IGUAL: MotoTexto = { modelo: 'LEONCINO 500', precio: '$ 4.500.000', condicion: null }
    const motos = [{ ...M1, condicion: null }, IGUAL]
    const base = [l('ROUSER 200', 'modelo'), l('LEONCINO 500', 'modelo'), ...COMUNES]
    it('aparece dos veces => ok', () => expect(comparar([...base, l('$ 4.500.000', 'precio'), l('$ 4.500.000', 'precio')], motos).ok).toBe(true))
    it('aparece una vez => falta el de una moto', () => {
      expect(difs([...base, l('$ 4.500.000', 'precio')], motos)).toEqual([{ campo: 'precio', motivo: 'falta', esperado: '$ 4.500.000', leido: null, moto: 2 }])
    })
    it('aparece tres veces => sobra una', () => {
      expect(difs([...base, l('$ 4.500.000', 'precio'), l('$ 4.500.000', 'precio'), l('$ 4.500.000', 'precio')], motos)).toEqual([{ campo: 'otro', motivo: 'sobra', esperado: null, leido: '$ 4.500.000' }])
    })
  })
})

describe('varias motos: cada modelo tiene que aparecer', () => {
  it('falta el modelo de una moto', () => {
    expect(difs(sin(BIEN, 'LEONCINO 500'))).toEqual([{ campo: 'modelo', motivo: 'falta', esperado: 'LEONCINO 500', leido: null, moto: 2 }])
  })
  it('un modelo escrito distinto', () => {
    const t = BIEN.map((x) => (x.texto === 'LEONCINO 500' ? l('LEONCINO 600', 'modelo') : x))
    expect(difs(t)).toEqual([{ campo: 'modelo', motivo: 'distinto', esperado: 'LEONCINO 500', leido: 'LEONCINO 600', moto: 2 }])
  })
  it('un modelo dudoso => ilegible', () => {
    const t = BIEN.map((x) => (x.texto === 'ROUSER 200' ? l('ROUSER 200', 'modelo', true) : x))
    expect(difs(t)[0]).toMatchObject({ campo: 'modelo', motivo: 'ilegible', moto: 1 })
  })
  it('un modelo no usa el texto de otro (dos modelos distintos, cada uno una vez)', () => {
    const t = [l('ROUSER 200', 'modelo'), ...de({ ...M2, modelo: null }), ...de({ ...M1, modelo: null }), ...COMUNES]
    expect(difs(t)).toEqual([{ campo: 'modelo', motivo: 'falta', esperado: 'LEONCINO 500', leido: null, moto: 2 }])
  })
  it('dos motos con el mismo modelo (dos colores): tienen que aparecer las dos veces', () => {
    const motos = [{ ...M1, modelo: 'ROUSER 200' }, { ...M2, modelo: 'ROUSER 200' }]
    const dos = [l('ROUSER 200', 'modelo'), l('ROUSER 200', 'modelo'), ...de({ ...M1, modelo: null }), ...de({ ...M2, modelo: null }), ...COMUNES]
    expect(comparar(dos, motos).ok).toBe(true)
    expect(difs(sin(dos, 'ROUSER 200').concat([l('ROUSER 200', 'modelo')]), motos)).toEqual([{ campo: 'modelo', motivo: 'falta', esperado: 'ROUSER 200', leido: null, moto: 2 }])
  })
  it('un número que no se pidió bloquea (ej. el calco NS200 leído como texto)', () => {
    expect(difs([...BIEN, l('NS200', 'otro')])).toEqual([{ campo: 'otro', motivo: 'sobra', esperado: null, leido: 'NS200' }])
  })
})

describe('varias motos: la condición de cada una', () => {
  it('cada moto con su condición ok', () => expect(comparar(BIEN).ok).toBe(true))
  it('junta o separada', () => {
    expect(comparar(BIEN.flatMap((x) => (x.texto === '12 CUOTAS' ? [l('12 CUOTAS SIN INTERÉS', 'condicion')] : x.texto === 'SIN INTERÉS' ? [] : [x]))).ok).toBe(true)
  })
  it('falta la de una moto => bloquea y dice cuál', () => {
    expect(difs(sin(BIEN, 'CONTADO'))).toEqual([{ campo: 'condicion', motivo: 'falta', esperado: 'CONTADO', leido: null, moto: 2 }])
  })
  it('"13 CUOTAS" => distinto (lleva números)', () => {
    const t = BIEN.map((x) => (x.texto === '12 CUOTAS' ? l('13 CUOTAS', 'condicion') : x))
    expect(difs(t)[0]).toMatchObject({ campo: 'condicion', motivo: 'distinto', moto: 1 })
  })
  it('una moto sin condición esperada: lo que aparezca con dígitos bloquea', () => {
    expect(difs([...BIEN, ...de({ ...M3, modelo: null, precio: null }), l('24 CUOTAS', 'condicion')], [M1, M2]).length).toBeGreaterThan(0)
  })
  it('dos motos con la misma condición piden dos apariciones', () => {
    const motos = [{ ...M1, condicion: { texto: 'CONTADO', destacado: '' } }, { ...M2, condicion: { texto: 'CONTADO', destacado: '' } }]
    const una = [l('ROUSER 200', 'modelo'), l('LEONCINO 500', 'modelo'), l('$ 4.500.000', 'precio'), l('$ 7.000.000', 'precio'), l('CONTADO', 'condicion'), ...COMUNES]
    expect(difs(una, motos)).toEqual([{ campo: 'condicion', motivo: 'falta', esperado: 'CONTADO', leido: null, moto: 2 }])
    expect(comparar([...una, l('CONTADO', 'condicion')], motos).ok).toBe(true)
  })
})

describe('varias motos: lo de toda la placa', () => {
  it('frase escrita distinta bloquea (ortografía visible); ausente solo avisa', () => {
    const d = difs(BIEN.map((x) => (x.rol === 'frase' ? l('Elegi la tuia', 'frase') : x)))
    expect(d).toEqual([{ campo: 'frase', motivo: 'distinto', esperado: 'Elegí la tuya', leido: 'Elegi la tuia' }])
    const r = comparar(sin(BIEN, 'Elegí la tuya'))
    expect(r.ok).toBe(true)
    expect(r.avisos).toEqual([{ campo: 'frase', motivo: 'falta', esperado: 'Elegí la tuya', leido: null }])
  })
  it('botón y lugar', () => {
    expect(difs(BIEN.map((x) => (x.rol === 'cta' ? l('CONSULTANO', 'cta') : x)))[0]).toMatchObject({ campo: 'cta', motivo: 'distinto' })
    expect(comparar(sin(BIEN, 'Quilmes')).avisos[0]).toMatchObject({ campo: 'lugar', motivo: 'falta' })
  })
  it('nombre del negocio cuando no hay logo dibujable', () => {
    expect(comparar([...BIEN, l('Benelli Store Quilmes', 'marca')], [M1, M2], { logo: 'nombre', negocio: 'Benelli Store Quilmes' }).ok).toBe(true)
  })
  it('un logo dibujado por la IA solo avisa', () => {
    const r = comparar([...BIEN, l('SUZUKI', 'marca')])
    expect(r.ok).toBe(true)
    expect(r.avisos).toContainEqual({ campo: 'negocio', motivo: 'sobra', esperado: null, leido: 'SUZUKI' })
  })
})

describe('varias motos: lo que la persona sacó', () => {
  it('el precio sacado: ningún monto puede aparecer', () => {
    const motos = [{ ...M1, precio: null }, { ...M2, precio: null }]
    const sinPrecios = [...de(motos[0]!), ...de(motos[1]!), ...COMUNES]
    expect(comparar(sinPrecios, motos, { ocultos: ['precio'] }).ok).toBe(true)
    expect(difs([...sinPrecios, l('$ 4.500.000', 'precio')], motos, { ocultos: ['precio'] })).toEqual([{ campo: 'precio', motivo: 'sobra', esperado: null, leido: '$ 4.500.000' }])
  })
  it('el modelo sacado: un texto con rol modelo bloquea', () => {
    const motos = [{ ...M1, modelo: null }, { ...M2, modelo: null }]
    const t = [...de(motos[0]!), ...de(motos[1]!), ...COMUNES]
    expect(comparar(t, motos, { ocultos: ['modelo'] }).ok).toBe(true)
    expect(difs([...t, l('ROUSER', 'modelo')], motos, { ocultos: ['modelo'] })).toEqual([{ campo: 'modelo', motivo: 'sobra', esperado: null, leido: 'ROUSER' }])
  })
})

describe('varias motos: lectura vacía', () => {
  it('si se esperaba algo y no se leyó nada, bloquea con la falta de cada modelo y cada precio', () => {
    const r = compararTextos(esperado(), lectura([]))
    expect(r.ok).toBe(false)
    const d = r.ok ? [] : r.diferencias
    expect(d).toContainEqual({ campo: 'modelo', motivo: 'falta', esperado: 'ROUSER 200', leido: null, moto: 1 })
    expect(d).toContainEqual({ campo: 'precio', motivo: 'falta', esperado: '$ 7.000.000', leido: null, moto: 2 })
    expect(d).toContainEqual({ campo: 'condicion', motivo: 'falta', esperado: 'CONTADO', leido: null, moto: 2 })
    expect(d).toContainEqual({ campo: 'frase', motivo: 'falta', esperado: 'Elegí la tuya', leido: null })
  })
  it('si no se esperaba nada, una placa sin texto es ok', () => {
    const vacia = esperado([{ modelo: null, precio: null, condicion: null }, { modelo: null, precio: null, condicion: null }], { frase: null, cta: null, lugar: null })
    expect(compararTextos(vacia, lectura([]))).toEqual({ ok: true, avisos: [] })
  })
})

describe('mensajeDiferencia con varias motos', () => {
  it('dice de qué moto habla', () => {
    expect(mensajeDiferencia({ campo: 'precio', motivo: 'distinto', esperado: '$ 7.000.000', leido: '$ 7.000.00', moto: 2 })).toBe('Moto 2 · Precio: dice «$ 7.000.00», tenía que decir «$ 7.000.000»')
    expect(mensajeDiferencia({ campo: 'modelo', motivo: 'falta', esperado: 'ROUSER 200', leido: null, moto: 1 })).toBe('Moto 1 · Modelo: no aparece «ROUSER 200»')
  })
  it('sin moto, igual que siempre', () => {
    expect(mensajeDiferencia({ campo: 'precio', motivo: 'falta', esperado: '$ 1', leido: null })).toBe('Precio: no aparece «$ 1»')
  })
})
