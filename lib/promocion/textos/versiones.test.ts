import { describe, it, expect } from 'vitest'
import { versionesDeTexto } from './versiones'
import { cambiosDePieza } from '../../contenidista/cambio-vista'
import type { TurnoVista } from '../../agentes/conversacion/tipos'
import { copyDePrueba } from '../fixture'

const turno = (n: number, o: Partial<TurnoVista> = {}): TurnoVista => ({
  id: `t${n}`, turno: n, pedido: `pedido ${n}`, estado: 'ok', respuesta: null, error: null, costoUsd: 0.001, creadoEn: '2026-10-29T10:00:00Z', ...o,
})
const c0 = copyDePrueba()
const c1 = copyDePrueba({ titular: 'Uno' })
const c2 = copyDePrueba({ titular: 'Dos' })

describe('versionesDeTexto', () => {
  it('sin cambios pedidos no hay versiones', () => {
    expect(versionesDeTexto([], c0)).toEqual([])
  })

  it('Original + Cambio 1..N, con el pedido de cada uno y la actual marcada', () => {
    const v = versionesDeTexto([turno(1, { respuesta: { antes: c0, despues: c1 } }), turno(2, { respuesta: { antes: c1, despues: c2 } })], c1)
    expect(v.map((x) => [x.etiqueta, x.pedido, x.copy.titular, x.actual])).toEqual([
      ['Original', null, c0.titular, false],
      ['Cambio 1', 'pedido 1', 'Uno', true],
      ['Cambio 2', 'pedido 2', 'Dos', false],
    ])
  })

  it('los turnos con error o pendientes no son versiones; una respuesta rota se ignora', () => {
    const v = versionesDeTexto(
      [turno(1, { respuesta: { antes: c0, despues: c1 } }), turno(2, { estado: 'error' }), turno(3, { estado: 'pendiente' }), turno(4, { respuesta: { cualquier: 'cosa' } })],
      c0,
    )
    expect(v.map((x) => x.etiqueta)).toEqual(['Original', 'Cambio 1'])
    expect(v[0]!.actual).toBe(true)
  })
})

describe('cambiosDePieza', () => {
  it('mapea la versión creada con el pedido que la originó', () => {
    expect(cambiosDePieza([turno(1, { pedido: 'más corto', respuesta: { version: 2 } }), turno(2, { estado: 'error' }), turno(3, { pedido: 'más oscuro', respuesta: { version: 3 } })])).toEqual({ 2: 'más corto', 3: 'más oscuro' })
  })
})
