import { describe, it, expect } from 'vitest'
import { LIMITES, textoPublicado } from './limites'

describe('textoPublicado', () => {
  it('junta copy y hashtags con una línea en blanco', () => {
    expect(textoPublicado({ copy: 'Hola', hashtags: ['#a', '#b'] })).toBe('Hola\n\n#a #b')
  })
  it('sin hashtags es el copy', () => expect(textoPublicado({ copy: 'Hola', hashtags: [] })).toBe('Hola'))
  it('los límites son los de Meta del diseño', () => {
    expect(LIMITES).toMatchObject({ COPY: 2200, HASHTAGS: 30, MENCIONES: 20, ALT: 1000, PIEZAS_POR_SEMANA: 12, NOTAS: 1000 })
  })
})
