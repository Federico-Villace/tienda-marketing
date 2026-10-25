import { describe, it, expect } from 'vitest'
import {
  resumir,
  agruparPorTipo,
  agruparPorDiaSemana,
  agruparPorPlataforma,
  diaSemanaAR,
  ranking,
  agruparPorMarca,
} from './agregados'
import { MARCAS } from './marcas'
import type { Publicacion, TipoPublicacion } from './tipos'

/**
 * Estos agregados son lo único que ve el LLM. Nunca filas crudas.
 * Si acá hay un error, el Analista razona sobre datos falsos.
 */

let contador = 0

function pub(parcial: Partial<Publicacion> = {}): Publicacion {
  contador += 1
  return {
    id: `p${contador}`,
    marcaId: 'm1',
    plataforma: 'instagram',
    tipo: 'imagen',
    texto: 'texto',
    permalink: null,
    alcance: null,
    clics: null,
    publicadoEn: new Date('2026-09-14T12:00:00Z'), // lunes
    vistas: 100,
    meGusta: 10,
    comentarios: 0,
    compartidos: 0,
    guardados: 0,
    ...parcial,
  }
}

describe('resumir', () => {
  it('no divide por cero con una lista vacía', () => {
    const r = resumir([])
    expect(r.publicaciones).toBe(0)
    expect(r.vistas).toBe(0)
    expect(r.vistasPromedio).toBe(0)
    expect(r.tasaInteraccion).toBe(0)
  })

  it('suma vistas e interacciones', () => {
    const r = resumir([
      pub({ vistas: 100, meGusta: 5, comentarios: 2, compartidos: 1, guardados: 2 }),
      pub({ vistas: 300, meGusta: 10, comentarios: 0, compartidos: 0, guardados: 0 }),
    ])
    expect(r.publicaciones).toBe(2)
    expect(r.vistas).toBe(400)
    expect(r.interacciones).toBe(20)
  })

  it('promedia las vistas por publicación', () => {
    const r = resumir([pub({ vistas: 100 }), pub({ vistas: 300 })])
    expect(r.vistasPromedio).toBe(200)
  })

  it('calcula la tasa de interacción sobre las vistas', () => {
    const r = resumir([pub({ vistas: 1000, meGusta: 50 })])
    expect(r.tasaInteraccion).toBeCloseTo(0.05)
  })

  it('devuelve tasa cero cuando no hubo vistas', () => {
    const r = resumir([pub({ vistas: 0, meGusta: 7 })])
    expect(r.tasaInteraccion).toBe(0)
  })
})

describe('agruparPorTipo', () => {
  it('devuelve vacío sin publicaciones', () => {
    expect(agruparPorTipo([])).toEqual([])
  })

  it('arma una fila por tipo presente, y no inventa los ausentes', () => {
    const filas = agruparPorTipo([
      pub({ tipo: 'reel' }),
      pub({ tipo: 'reel' }),
      pub({ tipo: 'imagen' }),
    ])
    expect(filas.map((f) => f.clave).sort()).toEqual(['imagen', 'reel'])
    expect(filas.find((f) => f.clave === 'reel')?.publicaciones).toBe(2)
  })

  it('ordena de mejor a peor por vistas promedio', () => {
    const filas = agruparPorTipo([
      pub({ tipo: 'imagen', vistas: 100 }),
      pub({ tipo: 'reel', vistas: 900 }),
      pub({ tipo: 'carrusel', vistas: 500 }),
    ])
    expect(filas.map((f) => f.clave)).toEqual(['reel', 'carrusel', 'imagen'])
  })

  it('promedia dentro del grupo, no sobre el total', () => {
    const filas = agruparPorTipo([
      pub({ tipo: 'reel', vistas: 100 }),
      pub({ tipo: 'reel', vistas: 300 }),
      pub({ tipo: 'imagen', vistas: 1000 }),
    ])
    expect(filas.find((f) => f.clave === 'reel')?.vistasPromedio).toBe(200)
  })
})

describe('agruparPorDiaSemana', () => {
  it('usa el nombre del día en español', () => {
    const filas = agruparPorDiaSemana([
      pub({ publicadoEn: new Date('2026-09-14T12:00:00Z') }), // lunes
    ])
    expect(filas[0]?.clave).toBe('lunes')
  })

  it('junta publicaciones del mismo día de semana aunque sean semanas distintas', () => {
    const filas = agruparPorDiaSemana([
      pub({ publicadoEn: new Date('2026-09-14T12:00:00Z') }), // lunes
      pub({ publicadoEn: new Date('2026-09-21T12:00:00Z') }), // lunes siguiente
      pub({ publicadoEn: new Date('2026-09-16T12:00:00Z') }), // miércoles
    ])
    expect(filas.find((f) => f.clave === 'lunes')?.publicaciones).toBe(2)
    expect(filas).toHaveLength(2)
  })
})

describe('agruparPorPlataforma', () => {
  it('separa Instagram de Facebook y promedia cada grupo', () => {
    const filas = agruparPorPlataforma([
      pub({ plataforma: 'instagram', vistas: 100 }),
      pub({ plataforma: 'instagram', vistas: 300 }),
      pub({ plataforma: 'facebook', vistas: 50 }),
    ])
    expect(filas.find((f) => f.clave === 'instagram')).toMatchObject({ publicaciones: 2, vistasPromedio: 200 })
    expect(filas.find((f) => f.clave === 'facebook')?.publicaciones).toBe(1)
  })
})

describe('diaSemanaAR', () => {
  it('usa la hora de Argentina (UTC-3): 00:30Z del lunes 19 es todavía domingo 18', () => {
    expect(diaSemanaAR(new Date('2026-10-19T00:30:00Z'))).toBe('domingo')
  })

  it('a las 03:00Z ya es lunes en Argentina', () => {
    expect(diaSemanaAR(new Date('2026-10-19T03:00:00Z'))).toBe('lunes')
  })

  it('2026-10-20T01:30Z (22:30 AR del lunes) es lunes', () => {
    expect(diaSemanaAR(new Date('2026-10-20T01:30:00Z'))).toBe('lunes')
  })
})

describe('agruparPorDiaSemana en hora de Argentina', () => {
  it('un post de las 21:30 AR del domingo cae en domingo, no en lunes', () => {
    const filas = agruparPorDiaSemana([pub({ publicadoEn: new Date('2026-10-19T00:30:00Z') })])
    expect(filas[0]?.clave).toBe('domingo')
  })
})

describe('ranking', () => {
  const muestra = (): Publicacion[] =>
    [900, 700, 500, 300, 100].map((vistas) => pub({ vistas }))

  it('devuelve listas vacías sin publicaciones', () => {
    const r = ranking([], 3)
    expect(r.mejores).toEqual([])
    expect(r.peores).toEqual([])
  })

  it('las mejores van de mayor a menor', () => {
    const r = ranking(muestra(), 3)
    expect(r.mejores.map((p) => p.vistas)).toEqual([900, 700, 500])
  })

  it('las peores van de menor a mayor', () => {
    const r = ranking(muestra(), 3)
    expect(r.peores.map((p) => p.vistas)).toEqual([100, 300, 500])
  })

  it('no devuelve más de las que hay', () => {
    const r = ranking([pub({ vistas: 10 })], 5)
    expect(r.mejores).toHaveLength(1)
    expect(r.peores).toHaveLength(1)
  })

  it('no modifica la lista original', () => {
    const original = muestra()
    const copia = [...original]
    ranking(original, 2)
    expect(original).toEqual(copia)
  })
})

describe('comentarios', () => {
  it('resumir suma los comentarios', () => {
    expect(resumir([pub({ comentarios: 3 }), pub({ comentarios: 4 })]).comentarios).toBe(7)
    expect(resumir([]).comentarios).toBe(0)
  })

  it('los grupos traen el promedio de comentarios', () => {
    const [fila] = agruparPorTipo([pub({ comentarios: 3 }), pub({ comentarios: 4 })])
    expect(fila!.comentariosPromedio).toBe(3.5)
  })
})

describe('alcance y clics', () => {
  it('suman solo las publicaciones que los informan', () => {
    const r = resumir([pub({ alcance: 80, clics: null }), pub({ alcance: null, clics: 12 }), pub({ alcance: 20, clics: 8 })])
    expect(r.alcance).toBe(100)
    expect(r.clics).toBe(20)
  })

  it('si ninguna los informa, son null (no 0)', () => {
    const r = resumir([pub(), pub()])
    expect(r.alcance).toBeNull()
    expect(r.clics).toBeNull()
  })
})

describe('agruparPorMarca', () => {
  const [zontes, suzuki] = [MARCAS[5]!, MARCAS[2]!]

  it('agrupa por NOMBRE de marca y ordena por vistas promedio', () => {
    const filas = agruparPorMarca([
      pub({ marcaId: zontes.id, vistas: 100 }),
      pub({ marcaId: suzuki.id, vistas: 400 }),
      pub({ marcaId: zontes.id, vistas: 200 }),
    ])
    expect(filas.map((f) => [f.clave, f.publicaciones, f.vistasPromedio])).toEqual([
      [suzuki.nombre, 1, 400],
      [zontes.nombre, 2, 150],
    ])
  })

  it('una marca desconocida se agrupa por su id, no se pierde', () => {
    expect(agruparPorMarca([pub({ marcaId: 'x' })]).map((f) => f.clave)).toEqual(['x'])
  })

  it('lista vacía: sin filas', () => {
    expect(agruparPorMarca([])).toEqual([])
  })
})
