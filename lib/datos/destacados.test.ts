import { describe, expect, it } from 'vitest'
import {
  UMBRALES,
  destacarCampanias,
  destacarPublicaciones,
  mediana,
  metricaDeCampania,
  rendimientoPorFormato,
} from './destacados'
import { MARCAS } from './marcas'
import type { CampaniaReal } from './publicidad'
import type { Publicacion } from './tipos'

/**
 * El ranking decide qué ve Julián como "lo que funcionó". Los umbrales de muestra
 * evitan que una campaña de $500 con 1 resultado salga primera.
 */

let n = 0
const campania = (p: Partial<CampaniaReal> = {}): CampaniaReal => {
  n += 1
  return {
    id: `c${n}`,
    nombre: `Campaña ${n}`,
    cuenta: 'act_1',
    objetivo: 'OUTCOME_ENGAGEMENT',
    estado: 'ACTIVE',
    gasto: 30000,
    impresiones: 100000,
    clics: 400,
    resultados: 20,
    dias: 7,
    ultimoDia: '2026-10-27',
    ...p,
  }
}

describe('metricaDeCampania', () => {
  it.each(['OUTCOME_ENGAGEMENT', 'OUTCOME_LEADS', 'OUTCOME_SALES', 'MESSAGES', 'LEAD_GENERATION', 'CONVERSIONS'])(
    '%s va por costo por resultado',
    (objetivo) => {
      const m = metricaDeCampania(campania({ objetivo, gasto: 20000, resultados: 10 }))
      expect(m).toMatchObject({ metrica: 'costoPorResultado', valor: 2000, muestra: 10, minimo: UMBRALES.MIN_RESULTADOS })
    },
  )

  it.each(['OUTCOME_TRAFFIC', 'LINK_CLICKS'])('%s va por costo por clic', (objetivo) => {
    const m = metricaDeCampania(campania({ objetivo, gasto: 30000, clics: 300 }))
    expect(m).toMatchObject({ metrica: 'costoPorClic', valor: 100, muestra: 300, minimo: UMBRALES.MIN_CLICS })
  })

  it.each(['OUTCOME_AWARENESS', 'REACH', 'BRAND_AWARENESS'])('%s va por CPM', (objetivo) => {
    const m = metricaDeCampania(campania({ objetivo, gasto: 20000, impresiones: 40000 }))
    expect(m).toMatchObject({ metrica: 'cpm', valor: 500, muestra: 40000, minimo: UMBRALES.MIN_IMPRESIONES })
  })

  it('sin objetivo: usa resultados si alcanzan; si no, clics; si no, no se rankea', () => {
    expect(metricaDeCampania(campania({ objetivo: null, resultados: 6 })).metrica).toBe('costoPorResultado')
    expect(metricaDeCampania(campania({ objetivo: 'RARO', resultados: 1, clics: 50 })).metrica).toBe('costoPorClic')
    expect(metricaDeCampania(campania({ objetivo: null, resultados: 1, clics: 5 })).metrica).toBeNull()
  })

  it('con muestra o gasto insuficiente, el valor sigue pero no es elegible', () => {
    expect(metricaDeCampania(campania({ gasto: 500, resultados: 1 })).elegible).toBe(false)
    expect(metricaDeCampania(campania({ gasto: 30000, resultados: 4 })).elegible).toBe(false)
    expect(metricaDeCampania(campania({ gasto: UMBRALES.MIN_GASTO_ARS, resultados: 5 })).elegible).toBe(true)
  })
})

describe('destacarCampanias', () => {
  const todas = MARCAS.map((m) => m.id)

  it('sin solapamiento: con pocas elegibles se parte la lista (n=3 → 2 mejores, 1 peor)', () => {
    const cs = [campania({ resultados: 30 }), campania({ resultados: 20 }), campania({ resultados: 10 })]
    const { principal } = destacarCampanias(cs, todas, true)
    expect(principal!.mejores.map((x) => x.campania.id)).toEqual([cs[0]!.id, cs[1]!.id])
    expect(principal!.peores.map((x) => x.campania.id)).toEqual([cs[2]!.id])
  })

  it('con 6 o más elegibles: 3 mejores y 3 peores, de menor a mayor costo', () => {
    const cs = [30, 25, 20, 15, 10, 6].map((r) => campania({ resultados: r }))
    const { principal } = destacarCampanias(cs, todas, true)
    expect(principal!.mejores).toHaveLength(3)
    expect(principal!.peores).toHaveLength(3)
    expect(principal!.mejores[0]!.valor).toBeLessThan(principal!.mejores[2]!.valor)
    expect(principal!.peores[0]!.valor).toBeGreaterThan(principal!.peores[2]!.valor)
  })

  it('una sola elegible: no hay ranking y se avisa que son pocas', () => {
    const { principal } = destacarCampanias([campania()], todas, true)
    expect(principal!.pocas).toBe(true)
    expect(principal!.mejores).toEqual([])
    expect(principal!.peores).toEqual([])
  })

  it('una campaña de ARS 500 con 1 resultado no aparece y se cuenta como excluida con su motivo', () => {
    const r = destacarCampanias([campania({ gasto: 500, resultados: 1 })], todas, true)
    expect(r.principal).toBeNull()
    expect(r.excluidas.cantidad).toBe(1)
    expect(r.excluidas.motivo).toContain('15.000')
  })

  it('gastó mucho sin resultados: encabeza lo peor del grupo de resultados', () => {
    const malo = campania({ gasto: 40000, resultados: 0 })
    const cs = [campania({ resultados: 30 }), campania({ resultados: 20 }), malo]
    const { principal, excluidas } = destacarCampanias(cs, todas, true)
    expect(principal!.sinResultados.map((c) => c.id)).toEqual([malo.id])
    expect(excluidas.cantidad).toBe(0)
  })

  it('sin resultados pero gasto bajo (< 2×umbral) no es "sin resultados": queda excluida', () => {
    const r = destacarCampanias([campania({ gasto: 20000, resultados: 0 })], todas, true)
    expect(r.principal).toBeNull()
    expect(r.excluidas.cantidad).toBe(1)
  })

  it('la métrica principal es la del grupo con más gasto elegible; la otra va aparte si tiene 2+', () => {
    const cpr = [campania({ gasto: 20000, resultados: 10 }), campania({ gasto: 20000, resultados: 8 })]
    const cpc = [
      campania({ objetivo: 'OUTCOME_TRAFFIC', gasto: 50000, clics: 400 }),
      campania({ objetivo: 'OUTCOME_TRAFFIC', gasto: 60000, clics: 500 }),
      campania({ objetivo: 'OUTCOME_TRAFFIC', gasto: 40000, clics: 300 }),
    ]
    const r = destacarCampanias([...cpr, ...cpc], todas, true)
    expect(r.principal!.metrica).toBe('costoPorClic')
    expect(r.otras.map((g) => g.metrica)).toEqual(['costoPorResultado'])
  })

  it('con filtro de marca solo entran las campañas cuyo nombre lleva el token de la marca', () => {
    const zontes = MARCAS.find((m) => m.nombre === 'Zontes Quilmes')!
    const a = campania({ nombre: 'Hot Sale Zontes 350', resultados: 30 })
    const b = campania({ nombre: 'Cuotas Benelli', resultados: 20 })
    const c = campania({ nombre: 'Zontes ruta', resultados: 10 })
    const r = destacarCampanias([a, b, c], [zontes.id], false)
    const ids = [...r.principal!.mejores, ...r.principal!.peores].map((x) => x.campania.id)
    expect(ids.sort()).toEqual([a.id, c.id].sort())
    expect(r.atribuidasPorNombre).toBe(true)
  })

  it('sin filtro de marca no se atribuye por nombre', () => {
    expect(destacarCampanias([campania()], todas, true).atribuidasPorNombre).toBe(false)
  })
})

describe('mediana', () => {
  it('impar, par y vacío', () => {
    expect(mediana([3, 1, 2])).toBe(2)
    expect(mediana([1, 2, 3, 10])).toBe(2.5)
    expect(mediana([])).toBe(0)
  })
})

const HASTA = '2026-10-28'
let k = 0
const post = (p: Partial<Publicacion> = {}): Publicacion => {
  k += 1
  return {
    id: `p${k}`,
    marcaId: MARCAS[5]!.id,
    plataforma: 'instagram',
    tipo: 'reel',
    texto: 'x',
    permalink: `https://ig/${k}`,
    alcance: null,
    clics: null,
    publicadoEn: new Date('2026-10-10T15:00:00Z'),
    vistas: 1000,
    meGusta: 50,
    comentarios: 0,
    compartidos: 0,
    guardados: 0,
    ...p,
  }
}

/** Cuenta con 5 posts de 1000 vistas (mediana 1000) + los que se pidan. */
const cuenta = (extras: Publicacion[], base = 5): Publicacion[] => [
  ...Array.from({ length: base }, () => post()),
  ...extras,
]

describe('destacarPublicaciones', () => {
  it('índice = vistas / mediana de su cuenta; mejores >= 1,2 y peores <= 0,8', () => {
    const estrella = post({ vistas: 3000 })
    const flojo = post({ vistas: 300 })
    const r = destacarPublicaciones(cuenta([estrella, flojo]), HASTA)
    expect(r.mejores.map((x) => x.publicacion.id)).toEqual([estrella.id])
    expect(r.mejores[0]!.indice).toBe(3)
    expect(r.mejores[0]!.mediana).toBe(1000)
    expect(r.peores.map((x) => x.publicacion.id)).toEqual([flojo.id])
    expect(r.peores[0]!.indice).toBe(0.3)
  })

  it('un post de ayer no entra (madurez de 3 días)', () => {
    const reciente = post({ vistas: 9000, publicadoEn: new Date('2026-10-27T12:00:00Z') })
    const r = destacarPublicaciones(cuenta([reciente]), HASTA)
    expect(r.mejores).toEqual([])
  })

  it('la madurez se mide contra "hasta", no contra hoy', () => {
    const viejo = post({ vistas: 9000, publicadoEn: new Date('2026-10-27T12:00:00Z') })
    const r = destacarPublicaciones(cuenta([viejo]), '2026-11-15')
    expect(r.mejores.map((x) => x.publicacion.id)).toEqual([viejo.id])
  })

  it('cuenta con menos de 5 posts: no se rankea y se cuenta como sin comparar', () => {
    const r = destacarPublicaciones([post({ vistas: 5000 }), post(), post(), post()], HASTA)
    expect(r.mejores).toEqual([])
    expect(r.peores).toEqual([])
    expect(r.sinComparar).toBe(4)
  })

  it('las historias quedan afuera', () => {
    const historia = post({ tipo: 'historia', vistas: 9000 })
    const r = destacarPublicaciones(cuenta([historia]), HASTA)
    expect(r.mejores).toEqual([])
    expect(r.sinComparar).toBe(0)
  })

  it('cada cuenta (marca × plataforma) se compara contra sí misma', () => {
    const fb = Array.from({ length: 5 }, () => post({ plataforma: 'facebook', vistas: 100 }))
    const fbBueno = post({ plataforma: 'facebook', vistas: 300 })
    const r = destacarPublicaciones([...cuenta([]), ...fb, fbBueno], HASTA)
    expect(r.mejores.map((x) => x.publicacion.id)).toEqual([fbBueno.id])
  })

  it('máximo 3 por lado, ordenados', () => {
    const buenos = [2000, 2500, 3000, 4000].map((v) => post({ vistas: v }))
    const r = destacarPublicaciones(cuenta(buenos), HASTA)
    expect(r.mejores.map((x) => x.publicacion.vistas)).toEqual([4000, 3000, 2500])
  })
})

describe('rendimientoPorFormato', () => {
  it('una fila por tipo presente; el mejor ocupa el 100% y las muestras chicas se marcan', () => {
    const ps = [
      ...Array.from({ length: 5 }, () => post({ tipo: 'reel', vistas: 2000 })),
      post({ tipo: 'video', vistas: 1000 }),
      post({ tipo: 'video', vistas: 1000 }),
    ]
    const filas = rendimientoPorFormato(ps)
    expect(filas.map((f) => f.tipo)).toEqual(['reel', 'video'])
    expect(filas[0]).toMatchObject({ publicaciones: 5, vistasPromedio: 2000, anchoPct: 100, muestraChica: false })
    expect(filas[1]).toMatchObject({ publicaciones: 2, anchoPct: 50, muestraChica: true })
  })

  it('sin publicaciones: lista vacía', () => {
    expect(rendimientoPorFormato([])).toEqual([])
  })
})
