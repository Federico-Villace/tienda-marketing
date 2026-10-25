import { describe, it, expect } from 'vitest'
import { vistaDePromocion } from './vista'
import { filaPromocion } from './fixture'

describe('vistaDePromocion', () => {
  it('pasa a camelCase y deriva el paso', () => {
    const v = vistaDePromocion(filaPromocion())
    expect(v).toMatchObject({
      id: 'p1',
      estado: 'borrador',
      revision: 1,
      marcaId: expect.any(String),
      modelo: 'TRK 502',
      fotoId: 'f1',
      aspecto: '4:5',
      plantilla: null,
      copy: null,
      placaLista: false,
      pasoActual: 2,
    })
  })
  it('nunca expone la ruta ni el hash de la placa ni la organización', () => {
    const v = vistaDePromocion(filaPromocion({ placa_ruta: 'org/promociones/p1/abc.png', placa_hash: 'abc' }))
    expect(v.placaLista).toBe(true)
    expect(JSON.stringify(v)).not.toContain('org/promociones')
    expect(JSON.stringify(v)).not.toContain('organizacion')
  })
  it('con texto elegido y placa, está en el paso 5', () => {
    const v = vistaDePromocion(
      filaPromocion({
        copy: { titular: 't', hook: 'h', copy: 'c', hashtags: ['#a', '#b', '#c'], cta: 'x', altText: 'a' },
        plantilla: 'oferta_abajo',
        escena_creativo_id: 'e1',
        placa_ruta: 'r',
        placa_hash: 'h',
      }),
    )
    expect(v.pasoActual).toBe(5)
  })
})
