import { describe, it, expect } from 'vitest'
import { rotularVersiones } from './versiones'
import { creativoDePrueba } from '../../components/creativos/fixture'
import { versionesDeImagen, type GeneracionVista } from '../productor/pantalla'

const gen = (id: string, creadoEn: string, o: Partial<GeneracionVista> = {}): GeneracionVista => ({
  id, estado: 'ok', motor: 'gemini-nano-banana-2.1', cantidad: 1, costoEstimadoUsd: 0.05, costoRealUsd: 0.04, error: null, creadoEn, interrumpida: false, ...o,
})

describe('rotularVersiones', () => {
  // Llegan las más nuevas primero (como las lee el servidor).
  const versiones = versionesDeImagen(
    [
      gen('g3', '2026-10-29T12:00:00Z', { ajuste: { instruccion: 'más oscuro', baseCreativoId: 'c1' } }),
      gen('g2', '2026-10-29T11:00:00Z'),
      gen('g1', '2026-10-29T10:00:00Z'),
    ],
    [creativoDePrueba({ id: 'c1', generacionId: 'g1' })],
  )

  it('numera por orden de creación: la primera es el Original y las siguientes Versión N', () => {
    const r = rotularVersiones(versiones)
    expect(r.get('g1')).toBe('Original')
    expect(r.get('g2')).toBe('Versión 2')
    expect(r.get('g3')).toBe('Versión 3 · Cambio: «más oscuro»')
  })

  it('no depende del orden en que llegan', () => {
    const r = rotularVersiones([...versiones].reverse())
    expect(r.get('g1')).toBe('Original')
    expect(r.get('g3')).toContain('Versión 3')
  })

  it('una sola versión es el Original', () => {
    expect([...rotularVersiones(versiones.slice(2)).values()]).toEqual(['Original'])
  })
})
