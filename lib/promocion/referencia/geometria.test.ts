import { describe, it, expect } from 'vitest'
import { acomodar, agrandar, despejar, encajar, interseca, recortar } from './geometria'

const lim = { x: 48, y: 24, w: 984, h: 1302 }

describe('geometría', () => {
  it('interseca: tocarse en un borde no es pisarse', () => {
    expect(interseca({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false)
    expect(interseca({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 10, h: 10 })).toBe(true)
  })
  it('recortar devuelve solo lo que cae dentro, o null', () => {
    expect(recortar({ x: 0, y: 0, w: 100, h: 100 }, { x: 50, y: 50, w: 100, h: 100 })).toEqual({ x: 50, y: 50, w: 50, h: 50 })
    expect(recortar({ x: 0, y: 0, w: 10, h: 10 }, { x: 50, y: 50, w: 10, h: 10 })).toBeNull()
  })
  it('encajar mueve y solo achica si no entra', () => {
    expect(encajar({ x: 0, y: 0, w: 100, h: 100 }, lim)).toEqual({ x: 48, y: 24, w: 100, h: 100 })
    expect(encajar({ x: 1000, y: 0, w: 100, h: 100 }, lim)).toEqual({ x: 932, y: 24, w: 100, h: 100 })
    expect(encajar({ x: 0, y: 0, w: 2000, h: 100 }, lim).w).toBe(984)
  })
  it('agrandar desde el centro, y null si el límite no admite el mínimo', () => {
    expect(agrandar({ x: 500, y: 500, w: 10, h: 10 }, { w: 100, h: 50 }, lim)).toEqual({ x: 455, y: 480, w: 100, h: 50 })
    expect(agrandar({ x: 500, y: 500, w: 10, h: 10 }, { w: 2000, h: 50 }, lim)).toBeNull()
    expect(agrandar({ x: 0, y: 0, w: 200, h: 200 }, { w: 100, h: 50 }, lim)).toEqual({ x: 48, y: 24, w: 200, h: 200 })
  })
  it('despejar: corre por el eje de menor desplazamiento y prefiere vertical si empata', () => {
    const moto = { x: 100, y: 500, w: 800, h: 400 }
    // Pisa 10 px por arriba de la moto: sube 10.
    expect(despejar({ x: 100, y: 450, w: 300, h: 60 }, [moto], lim, { w: 100, h: 40 })).toEqual({ x: 100, y: 440, w: 300, h: 60 })
    // Empate exacto arriba/abajo: arriba.
    const r = despejar({ x: 100, y: 700 - 30, w: 300, h: 60 }, [{ x: 0, y: 680, w: 2000, h: 40 }], lim, { w: 100, h: 40 })
    expect(r!.y + r!.h).toBeLessThanOrEqual(680)
  })
  it('despejar: recorta contra el límite y devuelve null si no cumple el mínimo', () => {
    const moto = { x: 48, y: 60, w: 984, h: 1260 }
    // Arriba de la moto quedan 36 px (24..60) y abajo 6: no entra un texto de 50.
    expect(despejar({ x: 100, y: 100, w: 300, h: 60 }, [moto], lim, { w: 100, h: 50 })).toBeNull()
  })
})

describe('acomodar', () => {
  it('recorta, agranda y despeja en un solo paso; no hace nada si ya estaba bien', () => {
    const moto = { x: 100, y: 500, w: 800, h: 400 }
    const buena = { x: 100, y: 100, w: 400, h: 80 }
    expect(acomodar(buena, { w: 300, h: 40 }, [moto], lim)).toEqual(buena)
    const r = acomodar({ x: 0, y: 480, w: 10, h: 10 }, { w: 300, h: 40 }, [moto], lim)!
    expect(r.w).toBeGreaterThanOrEqual(300)
    expect(interseca(r, moto)).toBe(false)
  })
  it('null si el mínimo no entra en el límite', () => {
    expect(acomodar({ x: 100, y: 100, w: 10, h: 10 }, { w: 5000, h: 40 }, [], lim)).toBeNull()
  })
})
