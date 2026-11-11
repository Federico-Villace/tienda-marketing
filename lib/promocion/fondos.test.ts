import { describe, it, expect } from 'vitest'
import { avisoDeFondo, fondoAlDescribir, fondoDeLaEscena, INFO_FONDO, resumenEscena } from './fondos'
import { FONDOS } from './tipos'

describe('INFO_FONDO', () => {
  it('todos los fondos tienen nombre y descripción, incluido "Usar solo mi descripción"', () => {
    for (const f of FONDOS) {
      expect(INFO_FONDO[f].nombre.length).toBeGreaterThan(0)
      expect(INFO_FONDO[f].descripcion.length).toBeGreaterThan(0)
    }
    expect(INFO_FONDO.solo_descripcion.nombre).toBe('Usar solo mi descripción')
  })
})

describe('fondoAlDescribir', () => {
  it('al escribir la PRIMERA descripción con el fondo por defecto (estudio), pasa a "solo mi descripción"', () => {
    expect(fondoAlDescribir('fondo_estudio', null, 'noche en puerto madero')).toBe('solo_descripcion')
  })
  it('no toca un fondo elegido distinto del de por defecto', () => {
    expect(fondoAlDescribir('escenario_urbano', null, 'de noche')).toBeNull()
    expect(fondoAlDescribir('solo_descripcion', null, 'de noche')).toBeNull()
  })
  it('si ya había descripción (la persona volvió a elegir el estudio a propósito), no lo cambia', () => {
    expect(fondoAlDescribir('fondo_estudio', 'de noche', 'de noche con lluvia')).toBeNull()
  })
  it('sin texto nuevo no cambia nada', () => {
    expect(fondoAlDescribir('fondo_estudio', null, '   ')).toBeNull()
    expect(fondoAlDescribir(null, null, 'algo')).toBeNull()
  })
})

describe('resumenEscena', () => {
  it('dice el fondo, si hubo inspiración y dónde va la moto', () => {
    expect(resumenEscena({ fondo: 'solo_descripcion', descripcion: 'foto de noche en puerto madero.', conInspiracion: true, posicionMoto: 'izquierda' })).toBe(
      'Fondo: tu descripción («foto de noche en puerto madero.») · Inspiración: sí · Moto: izquierda',
    )
  })
  it('con un fondo armado y descripción dice los dos; sin descripción, solo el armado', () => {
    expect(resumenEscena({ fondo: 'escenario_urbano', descripcion: 'de noche', conInspiracion: false, posicionMoto: 'centro' })).toBe(
      'Fondo: Escenario urbano + tu descripción («de noche») · Inspiración: no · Moto: centro',
    )
    expect(resumenEscena({ fondo: 'fondo_estudio', descripcion: null, conInspiracion: false, posicionMoto: 'derecha' })).toBe('Fondo: Fondo de estudio · Inspiración: no · Moto: derecha')
  })
  it('solo mi descripción sin texto (con inspiración): lo dice', () => {
    expect(resumenEscena({ fondo: 'solo_descripcion', descripcion: null, conInspiracion: true, posicionMoto: 'centro' })).toBe('Fondo: el ambiente de la foto de inspiración · Inspiración: sí · Moto: centro')
  })
  it('una descripción larga se acorta para que entre en una línea', () => {
    const r = resumenEscena({ fondo: 'solo_descripcion', descripcion: 'a'.repeat(200), conInspiracion: false, posicionMoto: 'centro' })
    expect(r).toContain(`«${'a'.repeat(59)}…»`)
  })
})

describe('fondoDeLaEscena', () => {
  const g = (id: string, fondo?: string, baseCreativoId?: string) => ({ id, ...(fondo ? { fondo } : {}), ...(baseCreativoId ? { ajuste: { instruccion: 'x', baseCreativoId } } : {}) })
  const escenas = [
    { generacion: g('g1', 'estudio_azul'), creativos: [{ id: 'c1' }, { id: 'c2' }] },
    { generacion: g('g2', undefined, 'c1'), creativos: [{ id: 'c3' }] },
    { generacion: g('g3', undefined, 'c3'), creativos: [{ id: 'c4' }] },
    { generacion: g('g9'), creativos: [{ id: 'c9' }] },
  ]
  it('el fondo de la generación de la imagen elegida', () => {
    expect(fondoDeLaEscena('c2', escenas)).toBe('estudio_azul')
  })
  it('un cambio pedido hereda el fondo de la imagen sobre la que se pidió, aunque haya varios cambios en cadena', () => {
    expect(fondoDeLaEscena('c3', escenas)).toBe('estudio_azul')
    expect(fondoDeLaEscena('c4', escenas)).toBe('estudio_azul')
  })
  it('si no se sabe (sin imagen, imagen desconocida o generación sin fondo) da null', () => {
    expect(fondoDeLaEscena(null, escenas)).toBeNull()
    expect(fondoDeLaEscena('nope', escenas)).toBeNull()
    expect(fondoDeLaEscena('c9', escenas)).toBeNull()
  })
  it('una cadena que se cierra sobre sí misma no cuelga', () => {
    const ciclo = [{ generacion: g('a', undefined, 'cb'), creativos: [{ id: 'ca' }] }, { generacion: g('b', undefined, 'ca'), creativos: [{ id: 'cb' }] }]
    expect(fondoDeLaEscena('ca', ciclo)).toBeNull()
  })
})

describe('avisoDeFondo (la plantilla queda mejor con otro fondo)', () => {
  it('plantilla de diseño + imagen hecha con otro fondo → sugiere el de la plantilla', () => {
    expect(avisoDeFondo('editorial', 'estudio_azul')).toEqual({ sugerido: 'estudio_crema', nombre: INFO_FONDO.estudio_crema.nombre })
    expect(avisoDeFondo('impactante_textura', 'fondo_estudio')?.sugerido).toBe('estudio_oscuro')
  })
  it('no avisa si el fondo ya es el sugerido, si no se sabe cuál fue, o si la plantilla es clásica o no hay', () => {
    expect(avisoDeFondo('editorial', 'estudio_crema')).toBeNull()
    expect(avisoDeFondo('editorial', null)).toBeNull()
    expect(avisoDeFondo('oferta_abajo', 'estudio_azul')).toBeNull()
    expect(avisoDeFondo(null, 'estudio_azul')).toBeNull()
  })
})
