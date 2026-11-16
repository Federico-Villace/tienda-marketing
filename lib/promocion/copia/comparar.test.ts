import { describe, it, expect } from 'vitest'
import { compararTextos, mensajeDiferencia, VERSION_COMPARACION } from './comparar'
import type { Lectura, RolLeido, TextoLeido, TextosCopia } from './tipos'

const esperado = (o: Partial<TextosCopia> = {}): TextosCopia => ({
  modelo: 'ROUSER 200',
  precio: '$ 4.500.000',
  condicion: { texto: '12 CUOTAS', destacado: 'SIN INTERÉS' },
  frase: 'Tu próxima moto',
  cta: 'Consultanos',
  lugar: 'Quilmes',
  negocio: null,
  logo: 'real',
  ocultos: [],
  ...o,
})
const l = (texto: string, rol: RolLeido = 'otro', dudoso = false): TextoLeido => ({ texto, rol, dudoso })
const BIEN: TextoLeido[] = [l('ROUSER 200', 'modelo'), l('$ 4.500.000', 'precio'), l('12 CUOTAS', 'condicion'), l('SIN INTERÉS', 'condicion'), l('Tu próxima moto', 'frase'), l('CONSULTANOS', 'cta'), l('Quilmes', 'lugar')]
const lectura = (textos: TextoLeido[]): Lectura => ({ textos, logo: null, fondoLogo: null })
const comparar = (textos: TextoLeido[], e: Partial<TextosCopia> = {}) => compararTextos(esperado(e), lectura(textos))
const difs = (textos: TextoLeido[], e: Partial<TextosCopia> = {}) => {
  const r = comparar(textos, e)
  return r.ok ? [] : r.diferencias
}
const avisos = (textos: TextoLeido[], e: Partial<TextosCopia> = {}) => comparar(textos, e).avisos

describe('compararTextos: lo bueno', () => {
  it('todo igual => ok sin avisos', () => {
    expect(comparar(BIEN)).toEqual({ ok: true, avisos: [] })
    expect(VERSION_COMPARACION).toBe('copia-comparacion-v1')
  })
  it('el orden en que se leyó no importa', () => {
    expect(comparar([...BIEN].reverse()).ok).toBe(true)
  })
})

describe('precio: separadores, dígitos y símbolo EXACTOS', () => {
  const con = (p: string, rol: RolLeido = 'precio', dudoso = false) => BIEN.map((t) => (t.rol === 'precio' ? l(p, rol, dudoso) : t))
  it('el espacio después del $ es opcional', () => {
    expect(comparar(con('$4.500.000')).ok).toBe(true)
    expect(comparar(con('$  4.500.000')).ok).toBe(true)
  })
  it('"4.500.00" => distinto', () => {
    expect(difs(con('$ 4.500.00'))).toEqual([{ campo: 'precio', motivo: 'distinto', esperado: '$ 4.500.000', leido: '$ 4.500.00' }])
  })
  it('"4,500,000" => distinto', () => expect(difs(con('$ 4,500,000'))[0]).toMatchObject({ campo: 'precio', motivo: 'distinto' }))
  it('"US$" vs "$" => distinto', () => expect(difs(con('US$ 4.500.000'))[0]).toMatchObject({ campo: 'precio', motivo: 'distinto' }))
  it('un dígito cambiado => distinto', () => expect(difs(con('$ 4.500.001'))[0]).toMatchObject({ campo: 'precio', motivo: 'distinto' }))
  it('dólares: "US$ 5.990" igual', () => {
    expect(comparar(BIEN.map((t) => (t.rol === 'precio' ? l('US$ 5.990', 'precio') : t)), { precio: 'US$ 5.990' }).ok).toBe(true)
  })
  it('no aparece => falta', () => {
    expect(difs(BIEN.filter((t) => t.rol !== 'precio'))).toEqual([{ campo: 'precio', motivo: 'falta', esperado: '$ 4.500.000', leido: null }])
  })
  it('dudoso => ilegible (bloquea)', () => expect(difs(con('$ 4.500.000', 'precio', true))[0]).toMatchObject({ campo: 'precio', motivo: 'ilegible' }))
  it('el precio sin el rol "precio" pero con el patrón de dinero igual se acepta', () => {
    expect(comparar(con('$ 4.500.000', 'otro')).ok).toBe(true)
  })
  it('el mismo precio repetido dos veces en la imagen está bien', () => {
    expect(comparar([...BIEN, l('$ 4.500.000', 'precio')]).ok).toBe(true)
  })
  it('otro monto de más (precio tachado, cuota) => sobra y bloquea', () => {
    expect(difs([...BIEN, l('$ 450.000', 'otro')])).toEqual([{ campo: 'otro', motivo: 'sobra', esperado: null, leido: '$ 450.000' }])
    expect(difs([...BIEN, l('1.234.567', 'otro')])[0]).toMatchObject({ motivo: 'sobra' })
  })
})

describe('modelo: alfanumérico, une renglones y espacios', () => {
  it('"ROUSER 200" en un texto, en dos renglones unidos, sin espacio o con guion', () => {
    for (const m of ['ROUSER 200', 'Rouser  200', 'ROUSER200', 'ROUSER-200', 'rouser 200']) expect(comparar(BIEN.map((t) => (t.rol === 'modelo' ? l(m, 'modelo') : t))).ok, m).toBe(true)
  })
  it('"ROUSER" y "200" como dos textos seguidos también', () => {
    expect(comparar([l('ROUSER', 'modelo'), l('200', 'modelo'), ...BIEN.filter((t) => t.rol !== 'modelo')]).ok).toBe(true)
  })
  it('un número distinto => distinto (bloquea)', () => {
    expect(difs(BIEN.map((t) => (t.rol === 'modelo' ? l('ROUSER 250', 'modelo') : t)))).toEqual([{ campo: 'modelo', motivo: 'distinto', esperado: 'ROUSER 200', leido: 'ROUSER 250' }])
  })
  it('falta y dudoso', () => {
    expect(difs(BIEN.filter((t) => t.rol !== 'modelo'))[0]).toMatchObject({ campo: 'modelo', motivo: 'falta' })
    expect(difs(BIEN.map((t) => (t.rol === 'modelo' ? l('ROUSER 200', 'modelo', true) : t)))[0]).toMatchObject({ campo: 'modelo', motivo: 'ilegible' })
  })
  it('un calco leído como texto ("NS200" con rol otro) bloquea por los dígitos: falso positivo posible y documentado', () => {
    expect(difs([...BIEN, l('NS200', 'otro')])).toEqual([{ campo: 'otro', motivo: 'sobra', esperado: null, leido: 'NS200' }])
  })
})

describe('condición: lleva números, bloquea', () => {
  const sin = BIEN.filter((t) => t.rol !== 'condicion')
  it('junto y separado', () => {
    expect(comparar([...sin, l('12 CUOTAS SIN INTERÉS', 'condicion')]).ok).toBe(true)
    expect(comparar([...sin, l('12 cuotas', 'condicion'), l('sin interés', 'condicion')]).ok).toBe(true)
  })
  it('"13 CUOTAS" => distinto', () => {
    expect(difs([...sin, l('13 CUOTAS', 'condicion'), l('SIN INTERÉS', 'condicion')])[0]).toMatchObject({ campo: 'condicion', motivo: 'distinto' })
  })
  it('falta', () => expect(difs(sin)[0]).toMatchObject({ campo: 'condicion', motivo: 'falta' }))
  it('dudoso => ilegible', () => expect(difs([...sin, l('12 CUOTAS', 'condicion', true), l('SIN INTERÉS', 'condicion')])[0]).toMatchObject({ campo: 'condicion', motivo: 'ilegible' }))
  it('sin destacado: solo el texto', () => {
    expect(comparar([...sin, l('CONTADO', 'condicion')], { condicion: { texto: 'CONTADO', destacado: '' } }).ok).toBe(true)
  })
})

describe('frase, botón y lugar: canon (mayúsculas, acentos, puntuación final)', () => {
  it('"TU PROXIMA MOTO" ok', () => {
    expect(comparar(BIEN.map((t) => (t.rol === 'frase' ? l('TU PROXIMA MOTO!', 'frase') : t))).ok).toBe(true)
  })
  it('presente pero distinto => bloquea (es ortografía visible)', () => {
    expect(difs(BIEN.map((t) => (t.rol === 'frase' ? l('Tu proxima mota', 'frase') : t)))).toEqual([{ campo: 'frase', motivo: 'distinto', esperado: 'Tu próxima moto', leido: 'Tu proxima mota' }])
    expect(difs(BIEN.map((t) => (t.rol === 'cta' ? l('CONSULTANOS YA', 'cta') : t)))[0]).toMatchObject({ campo: 'cta', motivo: 'distinto' })
    expect(difs(BIEN.map((t) => (t.rol === 'lugar' ? l('Quilmez', 'lugar') : t)))[0]).toMatchObject({ campo: 'lugar', motivo: 'distinto' })
  })
  it('ausente => aviso "falta", no bloquea', () => {
    const r = comparar(BIEN.filter((t) => t.rol !== 'frase'))
    expect(r.ok).toBe(true)
    expect(r.avisos).toEqual([{ campo: 'frase', motivo: 'falta', esperado: 'Tu próxima moto', leido: null }])
  })
  it('dudoso => aviso', () => {
    const r = comparar(BIEN.map((t) => (t.rol === 'lugar' ? l('Quilmes', 'lugar', true) : t)))
    expect(r.ok).toBe(true)
    expect(r.avisos[0]).toMatchObject({ campo: 'lugar', motivo: 'ilegible' })
  })
})

describe('nombre del negocio (sin logo dibujable)', () => {
  const e = { negocio: 'Suzuki Quilmes', logo: 'nombre' as const }
  it('escrito igual con rol marca => ok', () => {
    expect(comparar([...BIEN, l('SUZUKI QUILMES', 'marca')], e).ok).toBe(true)
  })
  it('escrito mal => bloquea; ausente => aviso', () => {
    expect(difs([...BIEN, l('Suzuky Quilmes', 'marca')], e)[0]).toMatchObject({ campo: 'negocio', motivo: 'distinto' })
    expect(comparar(BIEN, e)).toMatchObject({ ok: true, avisos: [{ campo: 'negocio', motivo: 'falta' }] })
  })
})

describe('sobrantes', () => {
  it('con logo real, la IA dibujó un logo (rol marca) => aviso, no bloquea', () => {
    const r = comparar([...BIEN, l('SUZUKI', 'marca')])
    expect(r.ok).toBe(true)
    expect(r.avisos).toEqual([{ campo: 'negocio', motivo: 'sobra', esperado: null, leido: 'SUZUKI' }])
  })
  it('texto sin dígitos de otro rol => aviso', () => {
    const r = comparar([...BIEN, l('RAW POWER', 'otro')])
    expect(r.ok).toBe(true)
    expect(r.avisos).toEqual([{ campo: 'otro', motivo: 'sobra', esperado: null, leido: 'RAW POWER' }])
  })
  it('un número que no pediste (rol distinto de marca) bloquea', () => {
    expect(difs([...BIEN, l('2026', 'otro')])[0]).toMatchObject({ campo: 'otro', motivo: 'sobra' })
  })
  it('cada texto leído se consume una sola vez: dos precios distintos no se tapan', () => {
    expect(difs([...BIEN, l('$ 4.500.001', 'precio')]).length).toBe(1)
  })
})

describe('sin textos leídos', () => {
  it('esperando textos => bloquea con lo que faltaba', () => {
    const r = comparar([])
    expect(r.ok).toBe(false)
    expect(r.ok ? [] : r.diferencias.map((d) => d.campo)).toContain('modelo')
    expect(r.ok ? [] : r.diferencias.map((d) => d.campo)).toContain('precio')
  })
})

describe('ocultos: lo sacado tiene que estar AUSENTE', () => {
  const sinPrecio = { precio: null, ocultos: ['precio' as const] }
  it('precio sacado y la imagen no lo trae => ok', () => {
    expect(comparar(BIEN.filter((t) => t.rol !== 'precio'), sinPrecio)).toEqual({ ok: true, avisos: [] })
  })
  it('precio sacado pero aparece "$ 4.500.000" => bloquea (sobra)', () => {
    expect(difs(BIEN, sinPrecio)).toEqual([{ campo: 'precio', motivo: 'sobra', esperado: null, leido: '$ 4.500.000' }])
  })
  it('precio sacado y aparece otro monto o un texto con rol precio => bloquea', () => {
    expect(difs([...BIEN.filter((t) => t.rol !== 'precio'), l('US$ 5.990', 'otro')], sinPrecio)[0]).toMatchObject({ campo: 'precio', motivo: 'sobra' })
    expect(difs([...BIEN.filter((t) => t.rol !== 'precio'), l('CONSULTÁ PRECIO', 'precio')], sinPrecio)[0]).toMatchObject({ campo: 'precio', motivo: 'sobra' })
  })
  it('sin precio por mostrarPrecio=false (no sacado): cualquier monto bloquea', () => {
    expect(difs(BIEN, { precio: null })).toEqual([{ campo: 'otro', motivo: 'sobra', esperado: null, leido: '$ 4.500.000' }])
  })
  it('modelo sacado: ausente ok; presente (rol modelo) bloquea', () => {
    const e = { modelo: null, ocultos: ['modelo' as const] }
    const sin = BIEN.filter((t) => t.rol !== 'modelo')
    expect(comparar(sin, e).ok).toBe(true)
    expect(difs(BIEN, e)).toEqual([{ campo: 'modelo', motivo: 'sobra', esperado: null, leido: 'ROUSER 200' }])
  })
  it('frase, botón, lugar y condición sacados: presentes bloquean aunque no tengan dígitos', () => {
    for (const [oc, rol] of [['frase', 'frase'], ['cta', 'cta'], ['lugar', 'lugar']] as const) {
      const e = { [oc]: null, ocultos: [oc] } as Partial<TextosCopia>
      expect(comparar(BIEN.filter((t) => t.rol !== rol), e).ok, oc).toBe(true)
      expect(difs(BIEN, e)[0], oc).toMatchObject({ campo: oc, motivo: 'sobra' })
    }
    const c = { condicion: null, ocultos: ['condicion' as const] }
    expect(comparar(BIEN.filter((t) => t.rol !== 'condicion'), c).ok).toBe(true)
    expect(difs(BIEN, c).every((d) => d.campo === 'condicion' && d.motivo === 'sobra')).toBe(true)
  })
  it('un texto que no es ninguno de los sacados sigue las reglas de siempre (aviso)', () => {
    const e = { frase: null, ocultos: ['frase' as const] }
    expect(comparar([...BIEN.filter((t) => t.rol !== 'frase'), l('RAW POWER', 'otro')], e)).toMatchObject({ ok: true })
  })
  it('logos sacados: la IA dibujó un logo o el nombre => bloquea', () => {
    const e = { logo: 'ninguno' as const, ocultos: ['logo999' as const, 'logoConcesionaria' as const] }
    expect(comparar(BIEN, e)).toEqual({ ok: true, avisos: [] })
    expect(difs([...BIEN, l('SUZUKI', 'marca')], e)).toEqual([{ campo: 'negocio', motivo: 'sobra', esperado: null, leido: 'SUZUKI' }])
  })
  it('todo sacado: una imagen SIN texto es válida', () => {
    const e = esperado({ modelo: null, precio: null, condicion: null, frase: null, cta: null, lugar: null, logo: 'ninguno', ocultos: ['modelo', 'frase', 'precio', 'condicion', 'cta', 'lugar', 'logo999', 'logoConcesionaria'] })
    expect(compararTextos(e, lectura([]))).toEqual({ ok: true, avisos: [] })
  })
  it('todo sacado y la IA escribió el precio igual => bloquea', () => {
    const e = esperado({ modelo: null, precio: null, condicion: null, frase: null, cta: null, lugar: null, logo: 'ninguno', ocultos: ['modelo', 'frase', 'precio', 'condicion', 'cta', 'lugar'] })
    expect(compararTextos(e, lectura([l('$ 4.500.000', 'precio')])).ok).toBe(false)
  })
})

describe('mensajeDiferencia', () => {
  const d = (campo: Parameters<typeof mensajeDiferencia>[0]['campo'], motivo: Parameters<typeof mensajeDiferencia>[0]['motivo'], e: string | null, x: string | null) => ({ campo, motivo, esperado: e, leido: x })
  it('distinto', () => expect(mensajeDiferencia(d('precio', 'distinto', '$ 4.500.000', '$ 4.500.00'))).toBe('Precio: dice «$ 4.500.00», tenía que decir «$ 4.500.000»'))
  it('falta', () => expect(mensajeDiferencia(d('precio', 'falta', '$ 4.500.000', null))).toBe('Precio: no aparece «$ 4.500.000»'))
  it('sobra de algo que no pediste', () => expect(mensajeDiferencia(d('otro', 'sobra', null, '$ 450.000'))).toBe('Apareció «$ 450.000», que no pediste'))
  it('sobra de algo que sacaste', () => expect(mensajeDiferencia(d('precio', 'sobra', null, '$ 4.500.000'))).toBe('Apareció «$ 4.500.000», que sacaste de la placa'))
  it('ilegible', () => expect(mensajeDiferencia(d('precio', 'ilegible', '$ 4.500.000', null))).toBe('Precio: no se lee con claridad'))
  it('nombres de campo', () => {
    expect(mensajeDiferencia(d('cta', 'falta', 'Consultanos', null))).toMatch(/^Botón:/)
    expect(mensajeDiferencia(d('condicion', 'falta', 'X', null))).toMatch(/^Condición:/)
    expect(mensajeDiferencia(d('negocio', 'falta', 'X', null))).toMatch(/^Nombre del negocio:/)
  })
  it('el aviso de un logo dibujado por la IA', () => {
    expect(mensajeDiferencia(d('negocio', 'sobra', null, 'SUZUKI'), { avisoLogo: true })).toMatch(/logo.*tapado por el real/)
  })
})
