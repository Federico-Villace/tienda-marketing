import { describe, it, expect } from 'vitest'
import { fuenteDeCategoria } from './fuentes'
import { FUENTES_POR_ROL } from '../fuentes-placa'
import { CATEGORIAS_FUENTE } from './tipos'

describe('fuenteDeCategoria', () => {
  for (const rol of ['modelo', 'frase', 'precio'] as const) {
    it(`${rol}: toda categoría cae SIEMPRE dentro de la lista cerrada del rol`, () => {
      for (const c of CATEGORIAS_FUENTE) expect(FUENTES_POR_ROL[rol], `${rol}/${c}`).toContain(fuenteDeCategoria(rol, c))
    })
  }
  it('manuscrita y pincel en modelo y precio se resuelven a una condensada (no se leen en mayúsculas)', () => {
    expect(fuenteDeCategoria('modelo', 'manuscrita')).toBe(fuenteDeCategoria('modelo', 'condensada'))
    expect(fuenteDeCategoria('precio', 'pincel')).toBe(fuenteDeCategoria('precio', 'condensada'))
  })
  it('la frase conserva la caligrafía', () => {
    expect(fuenteDeCategoria('frase', 'manuscrita')).toBe('kaushan')
    expect(fuenteDeCategoria('frase', 'pincel')).toBe('caveat-brush')
  })
  it('serif cae en una sora (no hay serif en la lista)', () => {
    expect(fuenteDeCategoria('modelo', 'serif')).toBe('sora-extrabold')
    expect(fuenteDeCategoria('frase', 'serif')).toBe('sora-semibold')
  })
  it('condición y pie: condensada → barlow-condensed, el resto sora-semibold; sin categoría también', () => {
    expect(fuenteDeCategoria('condicion', 'condensada')).toBe('barlow-condensed')
    expect(fuenteDeCategoria('pie', 'condensada')).toBe('barlow-condensed')
    for (const c of CATEGORIAS_FUENTE.filter((x) => x !== 'condensada')) expect(fuenteDeCategoria('condicion', c)).toBe('sora-semibold')
    expect(fuenteDeCategoria('condicion', null)).toBe('sora-semibold')
  })
  it('categoría nula usa el default del rol (que está en su lista)', () => {
    for (const rol of ['modelo', 'frase', 'precio'] as const) expect(FUENTES_POR_ROL[rol]).toContain(fuenteDeCategoria(rol, null))
  })
  it('es sustitución (no es 1:1) para serif y para manuscritas en modelo/precio', async () => {
    const { esSustitucion } = await import('./fuentes')
    expect(esSustitucion('modelo', 'serif')).toBe(true)
    expect(esSustitucion('precio', 'manuscrita')).toBe(true)
    expect(esSustitucion('frase', 'manuscrita')).toBe(false)
    expect(esSustitucion('modelo', 'condensada')).toBe(false)
  })
})
