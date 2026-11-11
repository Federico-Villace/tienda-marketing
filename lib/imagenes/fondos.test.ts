import { describe, it, expect } from 'vitest'
import { fondoDelPrompt, fondosPara, instruccionFondo, OPCIONES_FONDO, TEXTO_REFERENCIA, TEXTO_REFERENCIA_DISENO, textoReferencia } from './fondos'

describe('fondosPara', () => {
  it('promoción: sin "espacio para texto" (la placa ya reserva su zona)', () => {
    expect(fondosPara('promocion')).toEqual(['fondo_estudio', 'estudio_oscuro', 'estudio_azul', 'estudio_crema', 'escenario_urbano', 'escenario_ruta', 'solo_formato', 'solo_descripcion'])
  })
  it('/creativos: las mismas más "espacio para texto"', () => {
    expect(fondosPara('foto')).toEqual([...fondosPara('promocion'), 'espacio_texto'])
  })
  it('todas tienen nombre y descripción', () => {
    for (const id of fondosPara('foto')) {
      expect(OPCIONES_FONDO[id].nombre.length).toBeGreaterThan(3)
      expect(OPCIONES_FONDO[id].descripcion.length).toBeGreaterThan(3)
    }
  })
})

describe('fondos de estudio de las plantillas de diseño', () => {
  it('los ofrecen las dos secciones (paridad Promociones ↔ Imágenes)', () => {
    for (const id of ['estudio_oscuro', 'estudio_azul', 'estudio_crema'] as const) {
      expect(fondosPara('promocion')).toContain(id)
      expect(fondosPara('foto')).toContain(id)
    }
  })
  it('cada uno pide un estudio liso con su color y deja la moto igual', () => {
    expect(instruccionFondo('estudio_oscuro', '', false)).toBe('Reemplazá el fondo por un estudio fotográfico de fondo liso casi negro con textura sutil de cemento y luz lateral dramática, con piso continuo y sombra suave bajo la moto.')
    expect(instruccionFondo('estudio_azul', '', false)).toMatch(/azul intenso saturado con degradé suave/)
    expect(instruccionFondo('estudio_crema', '', false)).toMatch(/crema cálido claro, piso continuo, sombra suave/)
  })
})

describe('instruccionFondo', () => {
  it('un preset solo es la frase del preset', () => {
    expect(instruccionFondo('escenario_ruta', '', false)).toMatch(/ruta abierta/)
  })
  it('"mantener el fondo" no cambia el fondo', () => {
    expect(instruccionFondo('solo_formato', '', false)).toMatch(/No cambies el fondo/)
  })
  it('la descripción va entre « » y manda sobre el preset', () => {
    expect(instruccionFondo('fondo_estudio', 'de noche', false)).toMatch(/manda sobre[\s\S]*«de noche»/)
  })
  it('solo descripción sin nada pide un fondo neutro, nunca inventado', () => {
    expect(instruccionFondo('solo_descripcion', '', false)).toMatch(/neutro/)
  })
})

describe('textoReferencia (qué se toma de la foto de inspiración)', () => {
  it("'ambiente' es el texto de siempre, sin cambios", () => {
    expect(textoReferencia('ambiente')).toBe(TEXTO_REFERENCIA)
  })
  it("'diseno' pide emular composición, tratamiento gráfico y paleta de la SEGUNDA, y la moto sigue siendo la de la PRIMERA", () => {
    const t = textoReferencia('diseno')
    expect(t).toBe(TEXTO_REFERENCIA_DISENO)
    expect(t).toContain('Emulá la composición, el tratamiento gráfico y la paleta de la SEGUNDA imagen (formas, pinceladas, luces)')
    expect(t).toContain('la moto sigue siendo la de la PRIMERA')
  })
  it("'diseno' SIEMPRE prohíbe textos, números, precios, logos y marcas de agua de la referencia", () => {
    expect(TEXTO_REFERENCIA_DISENO).toMatch(/sin ningún texto, número, precio, logo ni marca de agua de ella/)
    expect(TEXTO_REFERENCIA_DISENO).toContain('Se adjuntan dos imágenes. La PRIMERA es la foto real de la moto: es la única moto que tiene que aparecer.')
  })
  it('un modo desconocido cae al de siempre (nunca al más permisivo)', () => {
    expect(textoReferencia('otro' as never)).toBe(TEXTO_REFERENCIA)
  })
})

describe('fondoDelPrompt (con qué fondo se generó una imagen)', () => {
  it('reconoce cada fondo armado por la frase que entra al prompt, con o sin descripción', () => {
    for (const id of ['fondo_estudio', 'estudio_oscuro', 'estudio_azul', 'estudio_crema', 'escenario_urbano', 'escenario_ruta', 'solo_formato'] as const) {
      expect(fondoDelPrompt(`Editá esta foto. ${instruccionFondo(id, '', false)} La moto entera.`), id).toBe(id)
      expect(fondoDelPrompt(`Editá esta foto. ${instruccionFondo(id, 'calle de noche', false)} La moto entera.`), `${id} + descripción`).toBe(id)
    }
  })
  it('"solo mi descripción" (con texto, con inspiración o neutro) se reconoce', () => {
    expect(fondoDelPrompt(`x ${instruccionFondo('solo_descripcion', 'un taller', false)}`)).toBe('solo_descripcion')
    expect(fondoDelPrompt(`x ${instruccionFondo('solo_descripcion', '', true)}`)).toBe('solo_descripcion')
  })
  it('un prompt que no dice el fondo (un cambio pedido, uno viejo o vacío) da null: no se adivina', () => {
    expect(fondoDelPrompt('Hacé la moto un poco más grande.')).toBeNull()
    expect(fondoDelPrompt('')).toBeNull()
    expect(fondoDelPrompt(null)).toBeNull()
    expect(fondoDelPrompt(undefined)).toBeNull()
  })
})
