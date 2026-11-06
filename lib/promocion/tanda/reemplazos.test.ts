import { describe, it, expect } from 'vitest'
import { loQueSeReemplaza, type PiezaComparable } from './reemplazos'

const pieza = (id: string, o: Partial<PiezaComparable> = {}): PiezaComparable => ({
  id, lineaExtra: null, fondoDescripcion: null, inspiracionFotoId: null, fondo: null, plantilla: null, posicionMoto: null, ...o,
})
const nombre = (p: { id: string }) => `Texto ${p.id}`

describe('loQueSeReemplaza', () => {
  it('piezas con líneas extra distintas y una propuesta: lista cada pieza y campo que se pisa, con lo que tenía', () => {
    const r = loQueSeReemplaza([pieza('1', { lineaExtra: 'Hot Sale' }), pieza('2', { lineaExtra: 'Solo hoy' })], { lineaExtra: 'Nueva' }, nombre)
    expect(r).toEqual([
      { pieza: 'Texto 1', campo: 'lineaExtra', antes: 'Hot Sale' },
      { pieza: 'Texto 2', campo: 'lineaExtra', antes: 'Solo hoy' },
    ])
  })

  it('si todas tenían lo mismo es una edición normal: nada que avisar', () => {
    expect(loQueSeReemplaza([pieza('1', { fondo: 'fondo_estudio' }), pieza('2', { fondo: 'fondo_estudio' })], { fondo: 'escenario_ruta' }, nombre)).toEqual([])
  })

  it('las que ya tienen el valor propuesto no se pisan', () => {
    const r = loQueSeReemplaza([pieza('1', { lineaExtra: 'Igual' }), pieza('2', { lineaExtra: 'Otra' })], { lineaExtra: 'Igual' }, nombre)
    expect(r).toEqual([{ pieza: 'Texto 2', campo: 'lineaExtra', antes: 'Otra' }])
  })

  it('los valores nulos no cuentan como algo que se pierde', () => {
    const r = loQueSeReemplaza([pieza('1', { lineaExtra: null }), pieza('2', { lineaExtra: 'Mía' })], { lineaExtra: 'Nueva' }, nombre)
    expect(r).toEqual([{ pieza: 'Texto 2', campo: 'lineaExtra', antes: 'Mía' }])
  })

  it('solo mira los campos de la propuesta (si no se manda la línea extra, no se avisa por ella)', () => {
    const r = loQueSeReemplaza([pieza('1', { lineaExtra: 'A', fondo: 'x' }), pieza('2', { lineaExtra: 'B', fondo: 'y' })], { fondo: 'z' }, nombre)
    expect(r.map((x) => x.campo)).toEqual(['fondo', 'fondo'])
  })

  it('cubre descripción del fondo, inspiración, fondo, diseño y posición de la moto', () => {
    const a = pieza('1', { fondoDescripcion: 'a', inspiracionFotoId: 'i1', fondo: 'f1', plantilla: 'p1', posicionMoto: 'izquierda' })
    const b = pieza('2', { fondoDescripcion: 'b', inspiracionFotoId: 'i2', fondo: 'f2', plantilla: 'p2', posicionMoto: 'derecha' })
    const r = loQueSeReemplaza([a, b], { fondoDescripcion: 'z', inspiracionFotoId: 'iz', fondo: 'fz', plantilla: 'pz', posicionMoto: 'centro' }, nombre)
    expect(new Set(r.map((x) => x.campo))).toEqual(new Set(['fondoDescripcion', 'inspiracionFotoId', 'fondo', 'plantilla', 'posicionMoto']))
    expect(r).toHaveLength(10)
  })

  it('una propuesta null (borrar) también pisa lo que había', () => {
    const r = loQueSeReemplaza([pieza('1', { fondoDescripcion: 'a' }), pieza('2', { fondoDescripcion: 'b' })], { fondoDescripcion: null }, nombre)
    expect(r).toHaveLength(2)
  })
})
