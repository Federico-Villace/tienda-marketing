import { describe, it, expect } from 'vitest'
import { idsDeRecursosGrilla } from './recursos-grilla'
import { leerManifiesto } from '../logos-servidor'
import { MARCAS } from '../../datos/marcas'
import { esDibujable, type ManifiestoLeido } from '../logos'

const real = leerManifiesto()
const sinLogo = (): ManifiestoLeido => ({ ...real, marcas: { ...real.marcas, x: { nombre: 'X', carpeta: 'x', logos: [] } } })

describe('idsDeRecursosGrilla: los logos de la grilla (fondo oscuro)', () => {
  it('lleva el logo 999 y el de la concesionaria; nada de texturas', () => {
    const ids = idsDeRecursosGrilla(real, MARCAS[2]!.id, [])
    expect(ids.logo999).toBe('logo999')
    expect(ids.logoConcesionaria).toMatch(new RegExp(`^${MARCAS[2]!.id}_`))
    expect(ids).toMatchObject({ logoMarca: null, textura: null, raspado: null })
  })
  it('sacar el logo 999 o el de la concesionaria los quita', () => {
    expect(idsDeRecursosGrilla(real, MARCAS[2]!.id, ['logo999']).logo999).toBeNull()
    const sin = idsDeRecursosGrilla(real, MARCAS[2]!.id, ['logoConcesionaria'])
    expect(sin.logoConcesionaria).toBeNull()
    expect(sin.placaClara).toBe(false)
    expect(sin.logo999).toBe('logo999')
  })
  it('una concesionaria sin logo (o con uno que satori no lee) queda sin logo: la placa escribe su nombre', () => {
    expect(idsDeRecursosGrilla(sinLogo(), 'x', []).logoConcesionaria).toBeNull()
    for (const [id, e] of Object.entries(real.marcas)) {
      const dibujables = e.logos.filter((l) => l.rol === 'concesionaria' && esDibujable(l))
      if (dibujables.length === 0) expect(idsDeRecursosGrilla(real, id, []).logoConcesionaria, id).toBeNull()
    }
  })
  it('el logo que elige es el que contrasta con un fondo oscuro', () => {
    for (const [id, e] of Object.entries(real.marcas)) {
      const ids = idsDeRecursosGrilla(real, id, [])
      if (ids.logoConcesionaria === null) continue
      const elegido = e.logos.find((l) => `${id}_${l.id}` === ids.logoConcesionaria)!
      const propios = e.logos.filter((l) => l.rol === 'concesionaria')
      expect(propios.some((l) => l.tono === 'claro' && esDibujable(l)) ? elegido.tono === 'claro' || elegido.tono === 'color' : true).toBe(true)
    }
  })
})
