import { describe, expect, it } from 'vitest'
import {
  aTextoPlano,
  cifrasDe,
  confianzaDe,
  enriquecer,
  validarAnalisisV4,
  verificarTexto,
  type AnalisisV4,
} from './estructurado'
import { entradaDePrueba } from './fixture.test-util'
import type { Hecho } from './hechos'

const entrada = entradaDePrueba()
const ids = (n: number) => entrada.hechos.slice(0, n).map((h) => h.id)

const item = (o: Record<string, unknown> = {}) => ({ accion: 'Más reels', porque: 'Rinden más', hechos: ids(1), ...o })
const idea = (o: Record<string, unknown> = {}) => ({
  titulo: 'Zontes 350T en reel',
  marca: 'Zontes Quilmes',
  modelo: '350T',
  formato: 'reel',
  tipoPromo: 'cuotas',
  momento: 'Viernes a la tarde',
  porque: 'Funcionó',
  hechos: ids(1),
  ...o,
})
const crudo = (o: Record<string, unknown> = {}) => ({ resumen: 'Anduvo bien.', hace: [item()], evita: [], proba: [], ideas: [idea()], ...o })

const valido = (c: unknown, modo: 'modelo' | 'edicion' = 'modelo') => validarAnalisisV4(c, entrada, modo)

describe('validarAnalisisV4 · modelo', () => {
  it('acepta una salida correcta', () => {
    const r = valido(crudo())
    expect(r).toMatchObject({ ok: true, descartados: 0 })
  })

  it('descarta el ítem que cita un hecho inexistente y lo cuenta', () => {
    const r = valido(crudo({ hace: [item(), item({ hechos: ['h999'] })] }))
    expect(r).toMatchObject({ ok: true, descartados: 1 })
    if (r.ok) expect(r.analisis.hace).toHaveLength(1)
  })

  it('sin ningún ítem válido es inválido (el endpoint responde 502)', () => {
    expect(valido(crudo({ hace: [item({ hechos: ['h999'] })], ideas: [] }))).toMatchObject({ ok: false })
    expect(valido('texto')).toMatchObject({ ok: false })
    expect(valido(crudo({ resumen: '' }))).toMatchObject({ ok: false })
  })

  it('recorta largos y listas en vez de rechazar', () => {
    const r = valido(crudo({ resumen: 'x'.repeat(900), hace: Array.from({ length: 5 }, () => item({ accion: 'a'.repeat(400) })) }))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.analisis.resumen).toHaveLength(400)
      expect(r.analisis.hace).toHaveLength(3)
      expect(r.analisis.hace[0]!.accion).toHaveLength(160)
    }
  })

  it('marca fuera del filtro → null; marca del filtro → su nombre canónico', () => {
    const r = valido(crudo({ ideas: [idea({ marca: 'Benelli Store Quilmes' }), idea({ marca: 'zontes quilmes' })] }))
    if (!r.ok) throw new Error('debía ser válido')
    expect(r.analisis.ideas.map((i) => i.marca)).toEqual([null, 'Zontes Quilmes'])
  })

  it('modelo de moto que no aparece en los textos o nombres que vio el modelo → null', () => {
    const r = valido(crudo({ ideas: [idea({ modelo: 'Ninja ZX-10R' }), idea({ modelo: 'TRK 502' }), idea({ modelo: '350 t' })] }))
    if (!r.ok) throw new Error('debía ser válido')
    expect(r.analisis.ideas.map((i) => i.modelo)).toEqual([null, 'TRK 502', '350 t'])
  })

  it('formato o tipo de promoción inválidos descartan la idea', () => {
    const r = valido(crudo({ ideas: [idea({ formato: 'tiktok' }), idea({ tipoPromo: 'gratis' })] }))
    if (!r.ok) throw new Error('debía ser válido')
    expect(r.analisis.ideas).toEqual([])
    expect(r.descartados).toBe(2)
  })
})

describe('validarAnalisisV4 · edición (estricta)', () => {
  it('acepta lo que ya era válido y deja quitar ítems', () => {
    expect(valido(crudo({ ideas: [] }), 'edicion')).toMatchObject({ ok: true })
  })

  it('un id que no existe en la entrada es error (no se pueden agregar hechos nuevos)', () => {
    const r = valido(crudo({ hace: [item({ hechos: ['h999'] })] }), 'edicion')
    expect(r).toMatchObject({ ok: false })
  })

  it('un largo excedido es error y no se recorta en silencio', () => {
    const r = valido(crudo({ resumen: 'x'.repeat(401) }), 'edicion')
    expect(r).toMatchObject({ ok: false })
  })

  it('sin ningún ítem en Hacé, Evitá y Probá es error', () => {
    expect(valido(crudo({ hace: [], ideas: [] }), 'edicion')).toMatchObject({ ok: false })
  })
})

describe('cifrasDe (es-AR)', () => {
  it('el punto es de miles y la coma es decimal', () => {
    expect(cifrasDe('Subieron 1.840 vistas, 4,2% y ARS 2.300')).toEqual([1840, 4.2, 2300])
    expect(cifrasDe('2,4× lo habitual en 12 posts')).toEqual([2.4, 12])
    expect(cifrasDe('ARS 1.234.567,5')).toEqual([1234567.5])
    expect(cifrasDe('sin números')).toEqual([])
  })

  it('el modelo escribe decimales con punto: un punto que no agrupa de a 3 dígitos es decimal', () => {
    expect(cifrasDe('rindió 5.71× lo habitual')).toEqual([5.71])
    expect(cifrasDe('1.75%, frente a 0.51%')).toEqual([1.75, 0.51])
    expect(cifrasDe('entre 0.31× y 0.45×')).toEqual([0.31, 0.45])
    expect(cifrasDe('1864.81 ARS y 1724.21 ARS')).toEqual([1864.81, 1724.21])
    expect(cifrasDe('17.29×')).toEqual([17.29])
    expect(cifrasDe('subió 2.5 puntos')).toEqual([2.5])
  })

  it('el punto sigue siendo de miles cuando agrupa de a 3 dígitos, y un 0 inicial no agrupa', () => {
    expect(cifrasDe('18.634 vistas y 1.840')).toEqual([18634, 1840])
    expect(cifrasDe('0.500')).toEqual([0.5])
    expect(cifrasDe('cerró el 1.')).toEqual([1])
  })
})

describe('verificarTexto', () => {
  const hecho = (valor: number, muestra: Hecho['muestra'] = null): Hecho => ({ id: 'h1', que: 'x', valor, unidad: 'vistas', muestra })

  it('una cifra que coincide con el hecho citado (o su muestra) está verificada', () => {
    expect(verificarTexto('Rinden 1.840 vistas', [hecho(1840)], entrada)).toBe(true)
    expect(verificarTexto('Rinden 1.850 vistas', [hecho(1840)], entrada)).toBe(true) // dentro de 1%
    expect(verificarTexto('Con 12 publicaciones', [hecho(5, { cantidad: 12, unidad: 'publicaciones' })], entrada)).toBe(true)
  })

  it('decimales con punto del modelo se verifican contra los hechos (5.71, 1.75, 1864.81)', () => {
    expect(verificarTexto('Rindió 5.71× lo habitual', [hecho(5.71)], entrada)).toBe(true)
    expect(verificarTexto('Interacción de 1.75%', [hecho(1.75)], entrada)).toBe(true)
    expect(verificarTexto('Cuesta 1864.81 ARS por mensaje', [hecho(1864.81)], entrada)).toBe(true)
    expect(verificarTexto('Rindió 5.71× lo habitual', [hecho(1840)], entrada)).toBe(false)
  })

  it('una cifra que ningún hecho respalda no está verificada', () => {
    expect(verificarTexto('Rinden 9.999 vistas', [hecho(1840)], entrada)).toBe(false)
  })

  it('números chicos (días, cantidades ≤31) y el año del período no cuentan', () => {
    expect(verificarTexto('Probá 2 semanas, los viernes, en 2026', [hecho(1840)], entrada)).toBe(true)
  })

  it('el redondeo a entero también cuenta', () => {
    expect(verificarTexto('Unas 4.2 ', [hecho(4.2)], entrada)).toBe(true)
    expect(verificarTexto('Casi 2.000 vistas', [hecho(1999.6)], entrada)).toBe(true)
  })
})

describe('confianzaDe (por muestra, la calcula el servidor)', () => {
  const con = (cantidad: number, unidad: string): Hecho => ({ id: 'h', que: 'x', valor: 1, unidad: 'x', muestra: { cantidad, unidad } })

  it.each([
    [10, 'publicaciones', 'alta'],
    [9, 'publicaciones', 'media'],
    [5, 'publicaciones', 'media'],
    [4, 'publicaciones', 'baja'],
    [30, 'resultados', 'alta'],
    [10, 'resultados', 'media'],
    [9, 'resultados', 'baja'],
    [300, 'clics', 'alta'],
    [100, 'clics', 'media'],
    [99, 'clics', 'baja'],
    [50000, 'impresiones', 'alta'],
    [10000, 'impresiones', 'media'],
    [9999, 'impresiones', 'baja'],
  ] as const)('%i %s → %s', (cantidad, unidad, esperado) => {
    expect(confianzaDe([con(cantidad, unidad)])).toBe(esperado)
  })

  it('manda la muestra mínima de los hechos citados', () => {
    expect(confianzaDe([con(50, 'publicaciones'), con(2, 'publicaciones')])).toBe('baja')
  })

  it('sin muestra con umbral no se afirma "alta"', () => {
    expect(confianzaDe([])).toBe('media')
    expect(confianzaDe([{ id: 'h', que: 'x', valor: 1, unidad: 'x', muestra: null }])).toBe('media')
  })
})

describe('enriquecer y aTextoPlano', () => {
  const analisis = (): AnalisisV4 => {
    const r = valido(crudo({ hace: [item({ porque: 'Subieron 9.999 vistas' })] }))
    if (!r.ok) throw new Error('inválido')
    return r.analisis
  }

  it('los datos de respaldo son los hechos del payload y una cifra inventada marca verificado:false', () => {
    const v = enriquecer(analisis(), entrada)
    expect(v.hace[0]!.datos[0]).toEqual(entrada.hechos[0])
    expect(v.hace[0]!.verificado).toBe(false)
    expect(v.ideas[0]).toMatchObject({ verificado: true, aspecto: '9:16', marcaId: expect.any(String) })
  })

  it('aTextoPlano devuelve texto legible, sin JSON ni ids de hechos', () => {
    const t = aTextoPlano(analisis())
    expect(t).toMatch(/^Resumen: Anduvo bien\./)
    expect(t).toMatch(/Hacé:\n- Más reels\./)
    expect(t).toMatch(/Ideas para armar:\n- Zontes 350T en reel/)
    expect(t).not.toMatch(/[{}]|"hechos"|\bh\d+\b/)
  })
})
