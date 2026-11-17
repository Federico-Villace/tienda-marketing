import { describe, it, expect } from 'vitest'
import { mensajeUsuario, INSTRUCCIONES } from './prompt'
import { fuenteTextos } from '../datos'
import { datosDePrueba } from '../fixture'
import type { MotoExtra } from '../varias/tipos'

const base = { marca: 'Benelli Store Quilmes', usuarioIg: 'benellistorequilmes', modelo: 'TRK 502', datos: datosDePrueba(), aprendizajes: null, intento: 1 }
const extra = (n: number, o: Partial<MotoExtra> = {}): MotoExtra => ({ fotoId: `f${n}`, modelo: `Leoncino ${n}00`, precio: { moneda: 'ARS', monto: n * 1_234_567 }, promo: { tipo: 'cuotas', detalle: '24 cuotas fijas' }, ...o })
const json = (m: string) => JSON.parse(m.split('\n')[1]!)

describe('mensajeUsuario con varias motos en una placa', () => {
  it('sin motos extra, el mensaje es EXACTAMENTE el de siempre', () => {
    expect(mensajeUsuario(base)).toBe(mensajeUsuario({ ...base, motosExtra: [] }))
    expect(json(mensajeUsuario(base))).not.toHaveProperty('motos')
    expect(mensajeUsuario(base)).not.toMatch(/motos juntas/)
  })
  it('lista TODAS las motos (la principal primero) con su modelo y su promo', () => {
    const j = json(mensajeUsuario({ ...base, motosExtra: [extra(2), extra(3)] }))
    expect(j.motos).toEqual([
      { modelo: 'TRK 502', promo: '12 cuotas sin interés' },
      { modelo: 'Leoncino 200', promo: '24 cuotas fijas' },
      { modelo: 'Leoncino 300', promo: '24 cuotas fijas' },
    ])
  })
  it('NO manda el precio de las otras motos: cada precio va en la imagen, no en los textos', () => {
    const m = mensajeUsuario({ ...base, motosExtra: [extra(2), extra(3)] })
    expect(m).not.toContain('2.469.134')
    expect(m).not.toContain('2469134')
    expect(m).not.toContain('3.703.701')
  })
  it('pide textos que sirvan para el conjunto y sin precios', () => {
    const m = mensajeUsuario({ ...base, motosExtra: [extra(2)] })
    expect(m).toMatch(/2 motos juntas/)
    expect(m).toMatch(/sirvan para todas/i)
    expect(m).toMatch(/no escribas ningún precio/i)
  })
  it('las instrucciones fijas no cambian (su versión sigue siendo la misma)', () => {
    expect(INSTRUCCIONES).toContain('promociona UNA moto')
  })
})

describe('fuenteTextos con varias motos', () => {
  it('los modelos de las otras motos respaldan sus números (Leoncino 500 respalda el 500)', () => {
    const f = fuenteTextos('TRK 502', datosDePrueba(), [extra(5)])
    expect(f).toContain('Leoncino 500')
    expect(f).toContain('TRK 502')
  })
  it('sin extras, igual que siempre', () => {
    expect(fuenteTextos('TRK 502', datosDePrueba())).toBe(fuenteTextos('TRK 502', datosDePrueba(), []))
  })
  it('no suma los precios de las otras motos como fuente de montos', () => {
    expect(fuenteTextos('TRK 502', datosDePrueba(), [extra(2)])).not.toContain('2469134')
  })
})
