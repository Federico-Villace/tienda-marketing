import { describe, it, expect } from 'vitest'
import { prepararDiseno } from './preparar'
import { idsDeRecursosDe } from './recursos-ids'
import { PLANTILLAS_DISENO } from './catalogo'
import { leerManifiesto } from '../logos-servidor'
import { MARCAS } from '../../datos/marcas'
import { ErrorTextoLargo, type TextosPlaca } from '../plantillas'
import { datosDePrueba } from '../fixture'

const textos: TextosPlaca = { marca: 'Benelli', modelo: 'TRK 502', precio: '$ 4.500.000', promo: '12 cuotas', titular: 'Tu próxima aventura', extra: '', lugar: 'Quilmes' }
const base = { plantilla: 'impactante_textura' as const, formato: '4:5' as const, textos, guardado: null, datos: datosDePrueba() }

describe('prepararDiseno', () => {
  it('resuelve defaults, layout y ajuste para el formato pedido', () => {
    const p = prepararDiseno(base)
    expect(p.diseno.frase).toBe('Tu próxima aventura')
    expect(p.layout.alto).toBe(1350)
    expect(p.ajuste.textoPrecio).toBe('$ 4.500.000')
  })
  it('el mismo diseño en otro formato cambia el layout, no los textos', () => {
    const a = prepararDiseno(base)
    const b = prepararDiseno({ ...base, formato: '9:16' })
    expect(b.layout.alto).toBe(1920)
    expect(b.diseno).toEqual(a.diseno)
  })
  it('un texto que no entra lanza ErrorTextoLargo', () => {
    expect(() => prepararDiseno({ ...base, textos: { ...textos, lugar: 'x'.repeat(200) } })).toThrow(ErrorTextoLargo)
  })
})

describe('catálogo', () => {
  it('impactante es oscura, usa el estudio oscuro y sus fuentes', () => {
    expect(PLANTILLAS_DISENO.impactante_textura).toMatchObject({ tono: 'oscuro', fondoSugerido: 'estudio_oscuro', fuentes: ['anton', 'kaushan', 'barlow-condensed'] })
    expect(PLANTILLAS_DISENO.editorial.tono).toBe('claro')
  })
})

describe('idsDeRecursosDe', () => {
  const m = leerManifiesto()
  it('999 siempre arriba; la textura solo en impactante', () => {
    const ids = idsDeRecursosDe(m, MARCAS[2]!.id, 'impactante_textura', null)
    expect(ids).toMatchObject({ logo999: 'logo999', logoConcesionaria: `${MARCAS[2]!.id}_suzuki`, logoMarca: null, textura: 'textura-grunge' })
    // Suzuki trae letras oscuras: sobre el fondo negro lleva placa blanca; sobre el crema, no hace falta.
    expect(ids.placaClara).toBe(true)
    expect(idsDeRecursosDe(m, MARCAS[2]!.id, 'editorial', null).placaClara).toBe(false)
    expect(idsDeRecursosDe(m, MARCAS[6]!.id, 'impactante_textura', null).placaClara).toBe(false)
    expect(idsDeRecursosDe(m, MARCAS[2]!.id, 'editorial', null).textura).toBeNull()
  })
  it('un logo en WebP (Benelli) no se dibuja: null y la placa escribe el nombre', () => {
    expect(idsDeRecursosDe(m, MARCAS[3]!.id, 'impactante_textura', null).logoConcesionaria).toBeNull()
  })
  it('sin logo de la concesionaria → null (la placa escribe el nombre)', () => {
    expect(idsDeRecursosDe(m, MARCAS[4]!.id, 'impactante_textura', null).logoConcesionaria).toBeNull()
  })
  it('el logo de marca solo si existe en el manifiesto de esa concesionaria', () => {
    expect(idsDeRecursosDe(m, MARCAS[1]!.id, 'impactante_textura', 'vespa').logoMarca).toBe(`${MARCAS[1]!.id}_vespa`)
    expect(idsDeRecursosDe(m, MARCAS[3]!.id, 'impactante_textura', 'vespa').logoMarca).toBeNull()
  })
})
