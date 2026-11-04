import { describe, expect, it } from 'vitest'
import {
  UMBRALES,
  destacarCampanias,
  destacarPublicaciones,
  formatearVeces,
  mediana,
  partir,
  metricaDeCampania,
  rendimientoPorFormato,
  separarAtipicos,
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

describe('posts con pauta (no se comparan con los orgánicos)', () => {
  const pago = (p: Partial<Publicacion> = {}) => post({ vistas: 900_000, conPauta: true, campaniaPauta: 'Boost', ...p })

  it('un post pago no mueve la mediana ni es "mejor"', () => {
    const boost = pago()
    const r = destacarPublicaciones(cuenta([boost]), HASTA)
    expect(r.todas.map((x) => x.publicacion.id)).not.toContain(boost.id)
    expect(r.mejores).toEqual([])
    expect(r.todas.every((x) => x.mediana === 1000 && x.cuenta === 5)).toBe(true)
  })

  it('4 orgánicos + 1 pago: la cuenta tiene 4 comparables, no rankea y sinComparar es 4', () => {
    const r = destacarPublicaciones([...cuenta([], 4), pago()], HASTA)
    expect(r.todas).toEqual([])
    expect(r.sinComparar).toBe(4)
  })

  it('conPauta lista los pagos por vistas desc, sin historias', () => {
    const chico = pago({ vistas: 5000 })
    const grande = pago({ vistas: 900_000 })
    const historia = pago({ tipo: 'historia', vistas: 99_999 })
    const r = destacarPublicaciones([...cuenta([chico, grande, historia]), post({ vistas: 1 })], HASTA)
    expect(r.conPauta.map((p) => p.id)).toEqual([grande.id, chico.id])
  })

  it('sin pagos, conPauta es lista vacía', () => {
    expect(destacarPublicaciones(cuenta([]), HASTA).conPauta).toEqual([])
  })

  it('un pago reciente (menos de 3 días) también se informa como pauta', () => {
    const reciente = pago({ publicadoEn: new Date('2026-10-27T12:00:00Z') })
    expect(destacarPublicaciones(cuenta([reciente]), HASTA).conPauta.map((p) => p.id)).toEqual([reciente.id])
  })

  it('rendimientoPorFormato no cuenta los posts pagos', () => {
    const ps = [post({ tipo: 'reel', vistas: 1000 }), pago({ tipo: 'reel' })]
    expect(rendimientoPorFormato(ps, HASTA)).toMatchObject([{ tipo: 'reel', publicaciones: 1, vistasPromedio: 1000 }])
  })
})

describe('posts fuera de lo normal (más de 20× la mediana de su cuenta)', () => {
  it('el tope es 20', () => expect(UMBRALES.topeAtipico).toBe(20))

  it('21× la mediana: no entra al ranking y se lista como atípico', () => {
    const raro = post({ vistas: 21_000 })
    const r = destacarPublicaciones(cuenta([raro]), HASTA)
    expect(r.todas.map((x) => x.publicacion.id)).not.toContain(raro.id)
    expect(r.mejores).toEqual([])
    expect(r.atipicos).toHaveLength(1)
    expect(r.atipicos[0]).toMatchObject({ vistas: 21_000, indice: 21, link: raro.permalink })
    expect(r.atipicos[0]!.publicacion.id).toBe(raro.id)
  })

  it('exactamente 20×: se queda en el ranking', () => {
    const justo = post({ vistas: 20_000 })
    const r = destacarPublicaciones(cuenta([justo]), HASTA)
    expect(r.atipicos).toEqual([])
    expect(r.mejores.map((x) => x.publicacion.id)).toEqual([justo.id])
  })

  it('la mediana se recalcula sin los atípicos (no inflan la base de la cuenta)', () => {
    // 5 posts de 1000 + 4 atípicos: la mediana cruda (con los 9) sería 1000 igual que
    // sin ellos, así que usamos una cuenta donde sí mueven la mediana.
    const normales = [1000, 1000, 1000, 1000, 1000].map((v) => post({ vistas: v }))
    const raros = [900_000, 800_000, 700_000, 600_000].map((v) => post({ vistas: v }))
    const bueno = post({ vistas: 3000 })
    const r = destacarPublicaciones([...normales, ...raros, bueno], HASTA)
    expect(r.atipicos).toHaveLength(4)
    expect(r.todas.every((x) => x.mediana === 1000 && x.cuenta === 6)).toBe(true)
    expect(r.mejores.map((x) => x.publicacion.id)).toEqual([bueno.id])
  })

  it('quedan menos de 5 tras sacar los atípicos: no se rankea, se listan y los normales suman a sinComparar', () => {
    const normales = [1000, 1000, 1000].map((v) => post({ vistas: v }))
    const raros = [900_000, 800_000].map((v) => post({ vistas: v }))
    const r = destacarPublicaciones([...normales, ...raros], HASTA)
    expect(r.atipicos).toHaveLength(2)
    expect(r.todas).toEqual([])
    expect(r.sinComparar).toBe(3)
  })

  it('conPauta sigue aparte: un pago enorme no es atípico ni cuenta en la mediana', () => {
    const pago = post({ vistas: 900_000, conPauta: true })
    const r = destacarPublicaciones(cuenta([pago]), HASTA)
    expect(r.atipicos).toEqual([])
    expect(r.conPauta.map((p) => p.id)).toEqual([pago.id])
  })

  it('funciona por cuenta (marca × plataforma): 5.000 vistas es normal en una y atípico en otra', () => {
    const fb = Array.from({ length: 5 }, () => post({ plataforma: 'facebook', vistas: 200 }))
    const fbRaro = post({ plataforma: 'facebook', vistas: 5000 })
    const igBueno = post({ vistas: 5000 })
    const r = destacarPublicaciones([...cuenta([igBueno]), ...fb, fbRaro], HASTA)
    expect(r.atipicos.map((x) => x.publicacion.id)).toEqual([fbRaro.id])
    expect(r.mejores.map((x) => x.publicacion.id)).toEqual([igBueno.id])
  })

  it('ordena los atípicos por vistas desc y no incluye historias', () => {
    const a = post({ vistas: 50_000 })
    const b = post({ vistas: 90_000 })
    const historia = post({ tipo: 'historia', vistas: 99_999 })
    const r = destacarPublicaciones(cuenta([a, b, historia]), HASTA)
    expect(r.atipicos.map((x) => x.vistas)).toEqual([90_000, 50_000])
  })

  it('rendimientoPorFormato no cuenta los atípicos', () => {
    const ps = [...cuenta([]), post({ tipo: 'reel', vistas: 900_000 })]
    const filas = rendimientoPorFormato(ps, HASTA)
    expect(filas).toMatchObject([{ tipo: 'reel', publicaciones: 5, vistasPromedio: 1000 }])
  })

  it('separarAtipicos devuelve los orgánicos sin los atípicos (para el Analista)', () => {
    const raro = post({ vistas: 900_000 })
    const pago = post({ vistas: 900_000, conPauta: true })
    const ps = [...cuenta([raro, pago])]
    const { sinAtipicos, atipicos } = separarAtipicos(ps, HASTA)
    expect(atipicos.map((p) => p.id)).toEqual([raro.id])
    expect(sinAtipicos).toHaveLength(6) // 5 normales + el pago (el pago lo maneja quien llama)
    expect(sinAtipicos.map((p) => p.id)).not.toContain(raro.id)
  })
})

describe('posts sin métricas (vistas 0)', () => {
  it('no entran al ranking ni a la mediana y se cuentan en sinMetricas', () => {
    const vacio = post({ vistas: 0 })
    const r = destacarPublicaciones(cuenta([vacio]), HASTA)
    expect(r.sinMetricas).toBe(1)
    expect(r.todas.map((x) => x.publicacion.id)).not.toContain(vacio.id)
    expect(r.peores).toEqual([])
    expect(r.todas.every((x) => x.cuenta === 5 && x.mediana === 1000)).toBe(true)
  })

  it('sin posts vacíos, sinMetricas es 0', () => {
    expect(destacarPublicaciones(cuenta([]), HASTA).sinMetricas).toBe(0)
  })

  it('un vacío no cuenta como post comparable de la cuenta (4 + 1 vacío = no rankea)', () => {
    const r = destacarPublicaciones([...cuenta([], 4), post({ vistas: 0 })], HASTA)
    expect(r.todas).toEqual([])
    expect(r.sinComparar).toBe(4)
    expect(r.sinMetricas).toBe(1)
  })

  it('los pagos y las historias sin vistas no se cuentan', () => {
    const r = destacarPublicaciones(
      cuenta([post({ vistas: 0, conPauta: true }), post({ vistas: 0, tipo: 'historia' })]),
      HASTA,
    )
    expect(r.sinMetricas).toBe(0)
  })

  it('rendimientoPorFormato no promedia los posts sin métricas', () => {
    const filas = rendimientoPorFormato([post({ vistas: 1000 }), post({ vistas: 0 })], HASTA)
    expect(filas).toMatchObject([{ publicaciones: 1, vistasPromedio: 1000 }])
  })
})

describe('piso de vistas de la cuenta (ADR-033)', () => {
  const chica = (vistas: number, plataforma: 'instagram' | 'facebook' = 'facebook') =>
    Array.from({ length: 5 }, () => post({ plataforma, vistas }))

  it('mediana de 3 vistas: la cuenta no es comparable y no entra al ranking', () => {
    const absurdo = post({ plataforma: 'facebook', vistas: 1800 })
    const r = destacarPublicaciones([...chica(3), absurdo], HASTA)
    expect(r.mejores).toEqual([])
    expect(r.todas).toEqual([])
    expect(r.cuentasPocasVistas).toEqual([{ marcaId: absurdo.marcaId, plataforma: 'facebook' }])
  })

  it('mediana exactamente en el piso: entra', () => {
    expect(UMBRALES.medianaMinimaVistas).toBe(100)
    const bueno = post({ plataforma: 'facebook', vistas: 300 })
    const r = destacarPublicaciones([...chica(100), bueno], HASTA)
    expect(r.mejores.map((x) => x.publicacion.id)).toEqual([bueno.id])
    expect(r.cuentasPocasVistas).toEqual([])
  })

  it('mediana de 99: afuera', () => {
    const r = destacarPublicaciones(chica(99), HASTA)
    expect(r.todas).toEqual([])
    expect(r.cuentasPocasVistas).toHaveLength(1)
  })

  it('las otras cuentas no se ven afectadas', () => {
    const estrella = post({ vistas: 3000 })
    const r = destacarPublicaciones([...cuenta([estrella]), ...chica(3)], HASTA)
    expect(r.mejores.map((x) => x.publicacion.id)).toEqual([estrella.id])
    expect(r.cuentasPocasVistas).toHaveLength(1)
  })
})

describe('formatearVeces (tope de 20× al mostrar)', () => {
  it.each([
    [2.4, '2,4×'],
    [20, '20×'],
    [20.01, 'más de 20×'],
    [592.8, 'más de 20×'],
  ])('%s -> %s', (n, esperado) => {
    expect(formatearVeces(n)).toBe(esperado)
  })
})

describe('"Ver todas" (solo para mostrar)', () => {
  it('todas = las comparables completas, de mayor a menor índice, aunque mejores/peores sigan en 3', () => {
    const extra = [4000, 3000, 2500, 2000, 200].map((v) => post({ vistas: v }))
    const r = destacarPublicaciones(cuenta(extra), HASTA)
    expect(r.todas).toHaveLength(10)
    expect(r.todas.map((x) => x.indice)).toEqual([...r.todas.map((x) => x.indice)].sort((a, b) => b - a))
    expect(r.mejores).toHaveLength(3)
  })

  it('las campañas elegibles quedan ordenadas de mejor a peor en `ordenadas`', () => {
    const cs = [10, 40, 20, 30].map((res) => campania({ resultados: res }))
    const g = destacarCampanias(cs, [], true).principal!
    expect(g.ordenadas).toHaveLength(4)
    expect(g.ordenadas.map((x) => x.muestra)).toEqual([40, 30, 20, 10])
  })

  it('partir con tope 5 devuelve 5 por lado con 10 o más, y sin solapar con menos', () => {
    const diez = Array.from({ length: 12 }, (_, i) => i)
    expect(partir(diez, 5).mejores).toHaveLength(5)
    expect(partir(diez, 5).peores).toEqual([11, 10, 9, 8, 7])
    const seis = diez.slice(0, 6)
    expect(partir(seis, 5)).toEqual({ mejores: [0, 1, 2], peores: [5, 4, 3] })
  })
})

describe('rendimientoPorFormato', () => {
  it('una fila por tipo presente; el mejor ocupa el 100% y las muestras chicas se marcan', () => {
    const ps = [
      ...Array.from({ length: 5 }, () => post({ tipo: 'reel', vistas: 2000 })),
      post({ tipo: 'video', vistas: 1000 }),
      post({ tipo: 'video', vistas: 1000 }),
    ]
    const filas = rendimientoPorFormato(ps, HASTA)
    expect(filas.map((f) => f.tipo)).toEqual(['reel', 'video'])
    expect(filas[0]).toMatchObject({ publicaciones: 5, vistasPromedio: 2000, anchoPct: 100, muestraChica: false })
    expect(filas[1]).toMatchObject({ publicaciones: 2, anchoPct: 50, muestraChica: true })
  })

  it('sin publicaciones: lista vacía', () => {
    expect(rendimientoPorFormato([], HASTA)).toEqual([])
  })
})
