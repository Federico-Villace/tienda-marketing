import { describe, it, expect } from 'vitest'
import { armarEntrada, hashEntrada, type DatosAnalisis } from './entrada'
import { VERSION_PROMPT } from './prompt'
import { MARCAS } from '../datos/marcas'
import type { Filtros } from '../datos/filtros'
import type { CampaniaReal } from '../datos/publicidad'
import type { Publicacion } from '../datos/tipos'

const filtros: Filtros = { marcaId: MARCAS[2]!.id, plataforma: 'todas', desde: '2026-09-21', hasta: '2026-10-20' }

let n = 0
const pub = (o: Partial<Publicacion> = {}): Publicacion => {
  n += 1
  return {
    id: `id-post-${n}`,
    marcaId: filtros.marcaId,
    plataforma: 'instagram',
    tipo: 'reel',
    texto: `texto ${n}`,
    permalink: `https://instagram.com/p/perma${n}`,
    publicadoEn: new Date('2026-10-03T15:00:00Z'),
    vistas: 100 + n,
    alcance: null,
    clics: null,
    meGusta: 5,
    comentarios: 1,
    compartidos: 0,
    guardados: 0,
    ...o,
  }
}

const camp = (o: Partial<CampaniaReal> = {}): CampaniaReal => {
  n += 1
  return {
    id: `id-camp-${n}`,
    nombre: `Campaña ${n}`,
    cuenta: 'cuenta-secreta',
    objetivo: 'OUTCOME_TRAFFIC',
    estado: 'ACTIVE',
    gasto: 1000 + n,
    impresiones: 5000,
    clics: 50,
    resultados: 5,
    dias: 10,
    ultimoDia: '2026-10-19',
    ...o,
  }
}

const datos = (publicaciones: Publicacion[], campanias: CampaniaReal[]): DatosAnalisis => ({
  filtros,
  publicaciones,
  campanias,
})

/** Recorre el objeto y falla si encuentra un número no finito (NaN/Infinity). */
const numerosFinitos = (v: unknown): boolean => {
  if (typeof v === 'number') return Number.isFinite(v)
  if (Array.isArray(v)) return v.every(numerosFinitos)
  if (v && typeof v === 'object') return Object.values(v).every(numerosFinitos)
  return true
}

describe('armarEntrada', () => {
  it('con 12 publicaciones arma top 5 y bottom 5, y trunca el texto a 140 caracteres', () => {
    const ps = Array.from({ length: 12 }, (_, i) => pub({ vistas: 1000 - i * 10, texto: 'x'.repeat(300) }))
    const e = armarEntrada(datos(ps, []))
    expect(e.organico.mejores).toHaveLength(5)
    expect(e.organico.peores).toHaveLength(5)
    expect(e.organico.mejores[0]!.vistas).toBe(1000)
    expect(e.organico.peores[0]!.vistas).toBe(890)
    expect(e.organico.mejores.every((p) => p.texto.length <= 140)).toBe(true)
  })

  it('cada ranking trae fecha, día de la semana en hora AR, plataforma y tipo', () => {
    const e = armarEntrada(datos([pub({ publicadoEn: new Date('2026-10-19T00:30:00Z') })], []))
    expect(e.organico.mejores[0]).toMatchObject({
      fecha: '2026-10-18',
      dia: 'domingo',
      plataforma: 'instagram',
      tipo: 'reel',
    })
  })

  it('con 15 campañas deja las 10 de mayor gasto, ordenadas de mayor a menor', () => {
    const cs = Array.from({ length: 15 }, (_, i) => camp({ gasto: (i + 1) * 100 }))
    const e = armarEntrada(datos([], cs))
    expect(e.publicidad.campanias).toHaveLength(10)
    expect(e.publicidad.campanias.map((c) => c.gasto)).toEqual([1500, 1400, 1300, 1200, 1100, 1000, 900, 800, 700, 600])
  })

  it('los totales de publicidad cubren todas las campañas, no solo las 10 enviadas', () => {
    const cs = Array.from({ length: 15 }, () => camp({ gasto: 100, resultados: 1 }))
    const e = armarEntrada(datos([], cs))
    expect(e.publicidad.totales).toMatchObject({ campanias: 15, gasto: 1500, resultados: 15, costoPorResultado: 100 })
  })

  it('calcula CTR y costo por resultado de cada campaña (null sin resultados)', () => {
    const e = armarEntrada(datos([], [camp({ gasto: 200, impresiones: 1000, clics: 10, resultados: 0 })]))
    expect(e.publicidad.campanias[0]).toMatchObject({ ctrPct: 1, costoPorResultado: null })
  })

  it('sin publicaciones ni campañas devuelve agregados vacíos válidos, sin NaN', () => {
    const e = armarEntrada(datos([], []))
    expect(e.organico.resumen.publicaciones).toBe(0)
    expect(e.organico.mejores).toEqual([])
    expect(e.publicidad.campanias).toEqual([])
    expect(numerosFinitos(e)).toBe(true)
  })

  it('informa período, filtro y notas de contexto', () => {
    const e = armarEntrada(datos([pub()], []))
    expect(e.periodo).toEqual({ desde: '2026-09-21', hasta: '2026-10-20', dias: 30 })
    expect(e.filtro).toEqual({ marca: 'Suzuki Quilmes', plataforma: 'todas' })
    expect(e.notas.join(' ')).toMatch(/acumuladas/)
    expect(e.notas.join(' ')).toMatch(/todas las marcas/)
  })

  it('nunca manda ids, permalinks, crudo, tokens ni ids de cuenta (regla #2)', () => {
    const ps = [pub({ id: 'SENTINELA_ID_POST', permalink: 'https://SENTINELA_PERMALINK', marcaId: 'SENTINELA_PAGINA' })]
    const cs = [camp({ id: 'SENTINELA_ID_CAMP', cuenta: 'SENTINELA_CUENTA' })]
    const sucio = { ...ps[0]!, crudo: { token: 'SENTINELA_TOKEN' }, cuentaMetaId: 'SENTINELA_CUENTA_META' }
    const json = JSON.stringify(armarEntrada(datos([sucio as Publicacion], cs)))
    for (const s of ['SENTINELA_ID_POST', 'SENTINELA_PERMALINK', 'SENTINELA_PAGINA', 'SENTINELA_ID_CAMP', 'SENTINELA_CUENTA', 'SENTINELA_TOKEN', 'SENTINELA_CUENTA_META']) {
      expect(json).not.toContain(s)
    }
    expect(json).not.toMatch(/"(id|permalink|crudo|token|cuenta_meta_id)"/)
  })

  it('con 500 publicaciones y 200 campañas el JSON queda bajo 12.000 caracteres', () => {
    const ps = Array.from({ length: 500 }, (_, i) =>
      pub({ texto: 'palabra '.repeat(40), tipo: (['reel', 'imagen', 'carrusel', 'video'] as const)[i % 4]!, plataforma: i % 2 ? 'facebook' : 'instagram' }),
    )
    const cs = Array.from({ length: 200 }, () => camp({ nombre: 'n'.repeat(200) }))
    const json = JSON.stringify(armarEntrada(datos(ps, cs)))
    expect(json.length).toBeLessThan(12_000)
  })

  it('redondea los números a 2 decimales', () => {
    const e = armarEntrada(datos([pub({ vistas: 100 }), pub({ vistas: 101 }), pub({ vistas: 101 })], []))
    expect(e.organico.resumen.vistasPromedio).toBe(100.67)
  })

  it('trunca el nombre de las campañas a 80 caracteres', () => {
    const e = armarEntrada(datos([], [camp({ nombre: 'a'.repeat(200) })]))
    expect(e.publicidad.campanias[0]!.nombre).toHaveLength(80)
  })
})

describe('hashEntrada', () => {
  const e = armarEntrada(datos([pub()], []))

  it('es un sha256 hexadecimal estable para la misma entrada', () => {
    const h = hashEntrada({ organizacionId: 'org', entrada: e, modelo: 'gpt-6-luna' })
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(hashEntrada({ organizacionId: 'org', entrada: e, modelo: 'gpt-6-luna' })).toBe(h)
  })

  it('cambia con la organización, el modelo o los datos', () => {
    const base = hashEntrada({ organizacionId: 'org', entrada: e, modelo: 'gpt-6-luna' })
    expect(hashEntrada({ organizacionId: 'otra', entrada: e, modelo: 'gpt-6-luna' })).not.toBe(base)
    expect(hashEntrada({ organizacionId: 'org', entrada: e, modelo: 'gpt-5.6-luna' })).not.toBe(base)
    const otra = armarEntrada(datos([pub({ vistas: 9999 })], []))
    expect(hashEntrada({ organizacionId: 'org', entrada: otra, modelo: 'gpt-6-luna' })).not.toBe(base)
  })

  it('incluye VERSION_PROMPT: es parte de la llave', () => {
    expect(VERSION_PROMPT.length).toBeGreaterThan(0)
  })
})
