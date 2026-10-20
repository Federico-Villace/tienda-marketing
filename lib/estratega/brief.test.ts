import { describe, it, expect } from 'vitest'
import { validarBrief } from './brief'
import { MARCAS } from '../datos/marcas'

const base = {
  analisisId: '11111111-1111-4111-8111-111111111111',
  objetivo: 'Vender más Zontes en noviembre',
  marcas: [MARCAS[5]!.nombre],
  desde: '2026-11-01',
  hasta: '2026-11-28',
}
const errores = (x: unknown) => {
  const r = validarBrief(x)
  return r.ok ? [] : r.errores
}

describe('validarBrief', () => {
  it('acepta un brief mínimo y normaliza los opcionales a null', () => {
    const r = validarBrief(base)
    expect(r).toEqual({
      ok: true,
      brief: { ...base, producto: null, presupuestoTopeArs: null, notas: null },
    })
  })

  it('recorta espacios del objetivo', () => {
    const r = validarBrief({ ...base, objetivo: '  Vender más  ' })
    expect(r.ok && r.brief.objetivo).toBe('Vender más')
  })

  it('S9: sin objetivo (o demasiado corto/largo) es error', () => {
    expect(errores({ ...base, objetivo: undefined }).join()).toMatch(/objetivo/i)
    expect(errores({ ...base, objetivo: '   ' }).join()).toMatch(/objetivo/i)
    expect(errores({ ...base, objetivo: 'x'.repeat(301) }).join()).toMatch(/objetivo/i)
  })

  it('analisisId debe ser un uuid', () => {
    expect(errores({ ...base, analisisId: 'abc' }).join()).toMatch(/análisis/i)
    expect(errores({ ...base, analisisId: undefined }).join()).toMatch(/análisis/i)
  })

  it('S10: marcas fuera de MARCAS es error; un subconjunto válido pasa; vacío es error', () => {
    expect(errores({ ...base, marcas: ['Marca Falsa'] }).join()).toMatch(/marca/i)
    expect(errores({ ...base, marcas: [] }).join()).toMatch(/marca/i)
    expect(errores({ ...base, marcas: 'Zontes' }).join()).toMatch(/marca/i)
    const dos = [MARCAS[0]!.nombre, MARCAS[1]!.nombre]
    expect(validarBrief({ ...base, marcas: dos }).ok).toBe(true)
  })

  it('S11: presupuesto 0, negativo o no numérico es error; null/ausente y >0 pasan', () => {
    for (const p of [0, -5, 'mucho', Number.NaN]) {
      expect(errores({ ...base, presupuestoTopeArs: p }).join()).toMatch(/presupuesto/i)
    }
    expect(validarBrief({ ...base, presupuestoTopeArs: null }).ok).toBe(true)
    const r = validarBrief({ ...base, presupuestoTopeArs: 500000 })
    expect(r.ok && r.brief.presupuestoTopeArs).toBe(500000)
  })

  it('S12: fecha inválida o desde > hasta es error; desde = hasta pasa', () => {
    expect(errores({ ...base, desde: '2026-13-45' }).join()).toMatch(/fecha/i)
    expect(errores({ ...base, hasta: 'mañana' }).join()).toMatch(/fecha/i)
    expect(errores({ ...base, desde: '2026-11-10', hasta: '2026-11-09' }).join()).toMatch(/desde/i)
    expect(validarBrief({ ...base, desde: '2026-11-10', hasta: '2026-11-10' }).ok).toBe(true)
  })

  it('la ventana no puede pasar de 90 días', () => {
    expect(errores({ ...base, desde: '2026-11-01', hasta: '2027-03-01' }).join()).toMatch(/90/)
    expect(validarBrief({ ...base, desde: '2026-11-01', hasta: '2027-01-29' }).ok).toBe(true)
  })

  it('S13: notas más largas que el tope es error', () => {
    expect(errores({ ...base, notas: 'x'.repeat(1001) }).join()).toMatch(/notas/i)
    expect(validarBrief({ ...base, notas: 'x'.repeat(1000) }).ok).toBe(true)
  })

  it('un body que no es objeto es error', () => {
    expect(validarBrief(null).ok).toBe(false)
    expect(validarBrief('x').ok).toBe(false)
  })
})
