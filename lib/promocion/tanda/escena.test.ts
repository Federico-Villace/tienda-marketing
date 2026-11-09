import { describe, it, expect } from 'vitest'
import { compartenEscena, escenaEsDe, pedidoEscenaDe } from './escena'
import { datosDePrueba } from '../fixture'

const hija = (o: Record<string, unknown> = {}) => ({
  foto_id: 'f1',
  aspecto: '4:5' as const,
  plantilla: 'oferta_abajo',
  fondo: 'fondo_estudio',
  fondo_descripcion: null,
  posicion_moto: 'centro',
  inspiracion_foto_id: null,
  datos: datosDePrueba(),
  ...o,
})

describe('compartenEscena', () => {
  it('hijas con la misma foto, formato, posición del texto, fondo, descripción, moto e inspiración comparten', () => {
    expect(compartenEscena([hija(), hija(), hija()])).toEqual({ ok: true })
  })

  it('el estilo (degradado o panel) y la línea extra NO entran: la escena no los usa, así comparte y se paga una sola vez', () => {
    expect(compartenEscena([hija(), hija({ plantilla: 'catalogo' })])).toEqual({ ok: true })
  })

  it("las plantillas de diseño comparten escena entre sí (posición 'marco'), pero no con una clásica", () => {
    expect(compartenEscena([hija({ plantilla: 'impactante_textura' }), hija({ plantilla: 'editorial' })])).toEqual({ ok: true })
    expect(compartenEscena([hija({ plantilla: 'impactante_textura' }), hija({ plantilla: 'oferta_abajo' })])).toEqual({ ok: false, difieren: ['posición del texto'] })
  })

  it('las indicaciones del redactor tampoco: ya no van a la escena', () => {
    const otra = hija({ datos: { ...datosDePrueba(), indicaciones: 'luz de tarde' } })
    expect(compartenEscena([hija(), otra])).toEqual({ ok: true })
  })

  it('el precio, la promo y el lugar NO entran: la escena no los usa', () => {
    const otra = hija({ datos: { ...datosDePrueba(), precio: { moneda: 'USD', monto: 1 }, lugar: 'Berazategui' } })
    expect(compartenEscena([hija(), otra])).toEqual({ ok: true })
  })

  it('dice cuáles difieren, una sola vez cada una y en orden fijo', () => {
    const r = compartenEscena([
      hija(),
      hija({ foto_id: 'f2', fondo: 'escenario_ruta', fondo_descripcion: 'luz de tarde', posicion_moto: 'derecha', inspiracion_foto_id: 'i1' }),
      hija({ aspecto: '9:16', plantilla: 'oferta_arriba' }),
    ])
    expect(r).toEqual({ ok: false, difieren: ['foto', 'formato', 'posición del texto', 'fondo', 'descripción del fondo', 'posición de la moto', 'foto de inspiración'] })
  })

  it('una sola hija comparte consigo misma; ninguna también (lo valida quien llama)', () => {
    expect(compartenEscena([hija()])).toEqual({ ok: true })
    expect(compartenEscena([])).toEqual({ ok: true })
  })
})

describe('escenaEsDe', () => {
  const promo = { id: 'p1', tanda_id: 't1' }
  it('una generación de la propia promoción es de ella', () => {
    expect(escenaEsDe({ promocion_id: 'p1', tanda_id: null }, promo)).toBe(true)
  })
  it('una generación de la MISMA tanda también', () => {
    expect(escenaEsDe({ promocion_id: null, tanda_id: 't1' }, promo)).toBe(true)
  })
  it('la de otra tanda, la de otra promoción o ninguna no', () => {
    expect(escenaEsDe({ promocion_id: null, tanda_id: 't2' }, promo)).toBe(false)
    expect(escenaEsDe({ promocion_id: 'p2', tanda_id: null }, promo)).toBe(false)
    expect(escenaEsDe({ promocion_id: null, tanda_id: null }, promo)).toBe(false)
    expect(escenaEsDe(null, promo)).toBe(false)
  })
  it('una promoción suelta nunca acepta una generación de tanda', () => {
    expect(escenaEsDe({ promocion_id: null, tanda_id: 't1' }, { id: 'p1', tanda_id: null })).toBe(false)
  })
  it('tolera filas sin la columna tanda_id', () => {
    expect(escenaEsDe({ promocion_id: 'p1' }, { id: 'p1', tanda_id: null })).toBe(true)
    expect(escenaEsDe({ promocion_id: null }, { id: 'p1', tanda_id: null })).toBe(false)
  })
})

describe('escenaEsDe con grupo (lote de motos)', () => {
  const promo = { id: 'p1', tanda_id: 't1', grupo: 2 }
  it('solo acepta la escena de su moto', () => {
    expect(escenaEsDe({ promocion_id: null, tanda_id: 't1', grupo: 2 }, promo)).toBe(true)
    expect(escenaEsDe({ promocion_id: null, tanda_id: 't1', grupo: 3 }, promo)).toBe(false)
    expect(escenaEsDe({ promocion_id: null, tanda_id: 't1', grupo: null }, promo)).toBe(false)
  })
  it('una hija sin grupo no acepta la escena de una moto de un lote', () => {
    expect(escenaEsDe({ promocion_id: null, tanda_id: 't1', grupo: 1 }, { id: 'p1', tanda_id: 't1', grupo: null })).toBe(false)
  })
  it('tanda de marcas o de textos (sin grupo en ninguno): como siempre', () => {
    expect(escenaEsDe({ promocion_id: null, tanda_id: 't1', grupo: null }, { id: 'p1', tanda_id: 't1', grupo: null })).toBe(true)
    expect(escenaEsDe({ promocion_id: null, tanda_id: 't1' }, { id: 'p1', tanda_id: 't1' })).toBe(true)
  })
  it('una generación de la propia promoción vale aunque tenga otro grupo', () => {
    expect(escenaEsDe({ promocion_id: 'p1', tanda_id: null, grupo: 5 }, promo)).toBe(true)
  })
})

describe('pedidoEscenaDe', () => {
  it('arma el pedido de la escena con lo que comparten las hijas: fondo, zona libre, formato, moto, descripción e inspiración', () => {
    const p = pedidoEscenaDe({ ...hija(), plantilla: 'oferta_costado', posicion_moto: 'izquierda', fondo_descripcion: 'luz de tarde', inspiracion_foto_id: 'i1' })
    expect(p).toEqual({ fondo: 'fondo_estudio', zona: 'derecha', aspecto: '4:5', posicionMoto: 'izquierda', descripcion: 'luz de tarde', conReferencia: true })
  })
  it('sin descripción ni inspiración', () => {
    expect(pedidoEscenaDe(hija())).toEqual({ fondo: 'fondo_estudio', zona: 'abajo', aspecto: '4:5', posicionMoto: 'centro', descripcion: null, conReferencia: false })
  })
})

describe('pedidoEscenaDe con una plantilla de diseño', () => {
  it("la zona es 'marco' y la moto va al centro", () => {
    const p = pedidoEscenaDe({ fondo: 'estudio_oscuro', plantilla: 'impactante_textura', aspecto: '4:5', posicion_moto: 'centro', fondo_descripcion: null, inspiracion_foto_id: null })
    expect(p).toMatchObject({ zona: 'marco', posicionMoto: 'centro', fondo: 'estudio_oscuro' })
  })
})

describe('compartenEscena · modo de la foto de inspiración', () => {
  it("con inspiración, hijas con distinto modo no comparten escena (el prompt es otro)", () => {
    const a = hija({ inspiracion_foto_id: 'r1', inspiracion_modo: 'ambiente' })
    const b = hija({ inspiracion_foto_id: 'r1', inspiracion_modo: 'diseno' })
    expect(compartenEscena([a, b])).toEqual({ ok: false, difieren: ['modo de la inspiración'] })
    expect(compartenEscena([b, { ...b }])).toEqual({ ok: true })
  })
  it("sin inspiración el modo no cuenta (no hay segunda imagen)", () => {
    expect(compartenEscena([hija({ inspiracion_modo: 'diseno' }), hija({ inspiracion_modo: 'ambiente' })])).toEqual({ ok: true })
  })
  it("pedidoEscenaDe lleva el modo al prompt de la escena", () => {
    const p = pedidoEscenaDe({ fondo: 'fondo_estudio', plantilla: 'oferta_abajo', aspecto: '4:5', posicion_moto: 'centro', fondo_descripcion: null, inspiracion_foto_id: 'r1', inspiracion_modo: 'diseno' })
    expect(p).toMatchObject({ conReferencia: true, modoInspiracion: 'diseno' })
  })
})
