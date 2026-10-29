import { describe, it, expect } from 'vitest'
import { opcionesDeImagen } from './opciones'
import { fondosPara } from './fondos'

describe('opcionesDeImagen: las dos secciones ofrecen lo mismo', () => {
  const promo = opcionesDeImagen('promocion')
  const foto = opcionesDeImagen('foto')

  it('mismos motores, mismo motor por defecto y mismos precios', () => {
    expect(foto.motores).toEqual(promo.motores)
    expect(foto.motorPorDefecto).toBe(promo.motorPorDefecto)
    expect(foto.topePorImagen).toEqual(promo.topePorImagen)
  })

  it('los fondos difieren solo en "espacio para texto"', () => {
    expect(promo.fondos.map((f) => f.id)).toEqual([...fondosPara('promocion')])
    expect(foto.fondos.map((f) => f.id).filter((id) => !promo.fondos.some((f) => f.id === id))).toEqual(['espacio_texto'])
  })

  it('un motor configurado sin precio no se usa; con precio, sí', () => {
    expect(opcionesDeImagen('foto', 'inventado').motorPorDefecto).toBe(promo.motorPorDefecto)
    expect(opcionesDeImagen('foto', 'gemini-3-pro-image').motorPorDefecto).toBe('gemini-3-pro-image')
  })

  it('la inspiración suma al tope', () => {
    for (const t of Object.values(promo.topePorImagen)) expect(t.conInspiracion).toBeGreaterThan(t.conFoto)
  })
})
