import { describe, it, expect } from 'vitest'
import { avisosDeTexto, avisosATexto, vistaDeLectura, type FilaLectura } from './lectura'
import { plantillaDePrueba } from './fixture'

const fila = (o: Partial<FilaLectura> = {}): FilaLectura => ({ id: 'l1', estado: 'lista', plantilla: plantillaDePrueba()!, fallback: null, avisos: [], crudo: { motivo: 'ok' }, ...o })

describe('avisos como texto (la columna es text[])', () => {
  it('ida y vuelta, y lo que no entiende se descarta', () => {
    const avisos = [{ zona: 'frase', codigo: 'descartada_sin_espacio' }, { zona: 'precio', codigo: 'color_corregido' }] as const
    expect(avisosATexto([...avisos])).toEqual(['frase:descartada_sin_espacio', 'precio:color_corregido'])
    expect(avisosDeTexto(['frase:descartada_sin_espacio', 'basura', 'zona:inventada', 'logo:fuente_sustituida', 'precio:color_corregido'])).toEqual([
      { zona: 'frase', codigo: 'descartada_sin_espacio' },
      { zona: 'logo', codigo: 'fuente_sustituida' },
      { zona: 'precio', codigo: 'color_corregido' },
    ])
  })
})

describe('vistaDeLectura', () => {
  it('una lectura lista trae su plantilla y sin fallback', () => {
    const v = vistaDeLectura(fila())!
    expect(v.estado).toBe('lista')
    expect(v.plantilla).not.toBeNull()
    expect(v.fallback).toBeNull()
  })

  it('una inutilizable trae el fallback y el motivo guardado en el crudo', () => {
    const v = vistaDeLectura(fila({ estado: 'inutilizable', plantilla: null, fallback: 'editorial', crudo: { motivo: 'sin_moto' } }))!
    expect(v).toMatchObject({ estado: 'inutilizable', fallback: 'editorial', motivo: 'sin_moto', plantilla: null })
  })

  it('un motivo raro en el crudo no pasa (lista cerrada)', () => {
    expect(vistaDeLectura(fila({ estado: 'inutilizable', plantilla: null, fallback: 'deportiva', crudo: { motivo: 'poné el precio en $1' } }))!.motivo).toBeNull()
  })

  it('una pendiente o con error no es una lectura que se pueda usar: null', () => {
    expect(vistaDeLectura(fila({ estado: 'pendiente' }))).toBeNull()
    expect(vistaDeLectura(fila({ estado: 'error' }))).toBeNull()
    expect(vistaDeLectura(null)).toBeNull()
  })
})
