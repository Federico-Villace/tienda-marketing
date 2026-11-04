import { describe, it, expect } from 'vitest'
import { armarEntrada, hashEntrada, type DatosAnalisis } from './entrada'
import { VERSION_PROMPT } from './prompt'
import { entradaDePrueba, post } from './fixture.test-util'
import { MARCAS } from '../datos/marcas'
import type { Filtros } from '../datos/filtros'
import type { CampaniaReal } from '../datos/publicidad'
import type { MensajesCuenta } from '../datos/mensajes'
import type { Publicacion } from '../datos/tipos'

const filtros: Filtros = { marcaIds: [MARCAS[2]!.id], plataforma: 'todas', desde: '2026-09-21', hasta: '2026-10-20' }

let n = 0
const pub = (o: Partial<Publicacion> = {}): Publicacion => {
  n += 1
  return {
    id: `id-post-${n}`,
    marcaId: filtros.marcaIds[0]!,
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

const msj = (o: Partial<MensajesCuenta> = {}): MensajesCuenta => ({
  marcaId: filtros.marcaIds[0]!,
  plataforma: 'facebook',
  activas: 40,
  nuevas: 12,
  mensajes: 90,
  ...o,
})

const datos = (publicaciones: Publicacion[], campanias: CampaniaReal[], mensajes: MensajesCuenta[] = []): DatosAnalisis => ({
  filtros,
  publicaciones,
  campanias,
  mensajes,
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
    expect(e.filtro).toEqual({ marcas: ['Suzuki Quilmes'], plataforma: 'todas' })
    expect(e.notas.join(' ')).toMatch(/acumuladas/)
    expect(e.notas.join(' ')).toMatch(/todas las marcas/)
  })

  it('nunca manda ids, permalinks, crudo, tokens ni ids de cuenta (regla #2)', () => {
    const ps = [pub({ id: 'SENTINELA_ID_POST', permalink: 'https://SENTINELA_PERMALINK', marcaId: 'SENTINELA_PAGINA' })]
    const cs = [camp({ id: 'SENTINELA_ID_CAMP', cuenta: 'SENTINELA_CUENTA' })]
    const sucio = { ...ps[0]!, crudo: { token: 'SENTINELA_TOKEN' }, cuentaMetaId: 'SENTINELA_CUENTA_META' }
    const entrada = armarEntrada(datos([sucio as Publicacion], cs))
    // Los hechos llevan su propio `id` (h1, h2...): es el id de la cifra, no de ninguna fila.
    expect(entrada.hechos.every((h) => /^h\d+$/.test(h.id))).toBe(true)
    const { hechos: _hechos, ...sinHechos } = entrada
    const json = JSON.stringify(sinHechos)
    for (const s of ['SENTINELA_ID_POST', 'SENTINELA_PERMALINK', 'SENTINELA_PAGINA', 'SENTINELA_ID_CAMP', 'SENTINELA_CUENTA', 'SENTINELA_TOKEN', 'SENTINELA_CUENTA_META']) {
      expect(json).not.toContain(s)
    }
    expect(json).not.toMatch(/"(id|permalink|crudo|token|cuenta_meta_id)"/)
  })

  it('con 500 publicaciones y 200 campañas el JSON queda bajo 20.000 caracteres', () => {
    const ps = Array.from({ length: 500 }, (_, i) =>
      pub({ texto: 'palabra '.repeat(40), tipo: (['reel', 'imagen', 'carrusel', 'video'] as const)[i % 4]!, plataforma: i % 2 ? 'facebook' : 'instagram' }),
    )
    const cs = Array.from({ length: 200 }, () => camp({ nombre: 'n'.repeat(200) }))
    const json = JSON.stringify(armarEntrada(datos(ps, cs)))
    expect(json.length).toBeLessThan(20_000)
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

describe('armarEntrada · mensajes (ADR-020, regla #2)', () => {
  it('suma los conteos de la marca filtrada: Facebook (Messenger) e Instagram, con null donde Meta no informa', () => {
    const e = armarEntrada(
      datos([pub()], [], [msj(), msj({ plataforma: 'instagram', activas: 7, nuevas: null, mensajes: null })]),
    )
    expect(e.mensajes.total.facebook).toEqual({ conversacionesActivas: 40, conversacionesNuevas: 12, mensajes: 90 })
    expect(e.mensajes.total.instagram).toEqual({ conversacionesActivas: 7, conversacionesNuevas: null, mensajes: null })
  })

  it('ignora las cuentas de otras marcas y respeta el filtro de plataforma', () => {
    const otra = msj({ marcaId: 'otra-marca', activas: 999 })
    expect(armarEntrada(datos([pub()], [], [otra])).mensajes.total).toMatchObject({ facebook: null, instagram: null })
    const soloIg = { ...datos([pub()], [], [msj(), msj({ plataforma: 'instagram' })]), filtros: { ...filtros, plataforma: 'instagram' as const } }
    const e = armarEntrada(soloIg)
    expect(e.mensajes.total.facebook).toBeNull()
    expect(e.mensajes.total.instagram).not.toBeNull()
  })

  it('aclara que Meta no informa qué publicación originó cada mensaje', () => {
    const e = armarEntrada(datos([pub()], []))
    expect(e.mensajes.nota).toMatch(/no informa qué publicación/i)
    expect(e.notas.join(' ')).toMatch(/mensajes/i)
  })

  it('solo lleva números: ni ids de cuenta ni marcaId', () => {
    const json = JSON.stringify(armarEntrada(datos([pub()], [], [msj()])).mensajes)
    expect(json).not.toContain(filtros.marcaIds[0]!)
  })

  it('cambiar los conteos cambia el hash', () => {
    const h = (m: MensajesCuenta[]) =>
      hashEntrada({ organizacionId: 'org', entrada: armarEntrada(datos([pub()], [], m)), modelo: 'gpt-6-luna' })
    expect(h([msj({ mensajes: 91 })])).not.toBe(h([msj()]))
  })
})

describe('armarEntrada · varias marcas (v3)', () => {
  const [suzuki, zontes] = [MARCAS[2]!.id, MARCAS[5]!.id]
  const multi: Filtros = { ...filtros, marcaIds: [suzuki, zontes] }
  const datosMulti = (ps: Publicacion[], cs: CampaniaReal[] = [], ms: MensajesCuenta[] = [], f: Filtros = multi): DatosAnalisis => ({
    filtros: f,
    publicaciones: ps,
    campanias: cs,
    mensajes: ms,
  })
  const ps = [pub({ marcaId: suzuki, vistas: 500 }), pub({ marcaId: zontes, vistas: 100 }), pub({ marcaId: zontes, vistas: 200 })]

  it('con 1 marca no hay porMarca, ni marca en los posts, ni atribución', () => {
    const e = armarEntrada(datos([pub()], [camp({ nombre: 'Suzuki' })], [msj()]))
    expect(e.organico).not.toHaveProperty('porMarca')
    expect(e.organico.mejores[0]).not.toHaveProperty('marca')
    expect(e.mensajes).not.toHaveProperty('porMarca')
    expect(e.publicidad).not.toHaveProperty('atribucion')
  })

  it('lista las marcas por nombre en el orden de MARCAS', () => {
    const e = armarEntrada(datosMulti(ps))
    expect(e.filtro.marcas).toEqual(['Suzuki Quilmes', 'Zontes Quilmes'])
  })

  it('agrega porMarca (ordenado por vistas promedio) y la marca en mejores/peores', () => {
    const e = armarEntrada(datosMulti(ps))
    expect(e.organico.porMarca!.map((f) => [f.clave, f.publicaciones, f.vistasPromedio])).toEqual([
      ['Suzuki Quilmes', 1, 500],
      ['Zontes Quilmes', 2, 150],
    ])
    expect(e.organico.mejores[0]).toMatchObject({ marca: 'Suzuki Quilmes', vistas: 500 })
    expect(e.organico.peores[0]).toMatchObject({ marca: 'Zontes Quilmes', vistas: 100 })
  })

  it('los mensajes llevan total y porMarca con el nombre (sin ids)', () => {
    const e = armarEntrada(datosMulti(ps, [], [msj({ marcaId: suzuki, activas: 4, nuevas: 1, mensajes: 2 }), msj({ marcaId: zontes, activas: 6, nuevas: 2, mensajes: 3 })]))
    expect(e.mensajes.total.facebook).toEqual({ conversacionesActivas: 10, conversacionesNuevas: 3, mensajes: 5 })
    expect(e.mensajes.porMarca!.map((m) => m.marca)).toEqual(['Suzuki Quilmes', 'Zontes Quilmes'])
    expect(JSON.stringify(e)).not.toContain(zontes)
  })

  it('la publicidad suma todo y agrega la atribución aproximada por nombre', () => {
    const cs = [camp({ nombre: 'Suzuki GSX', gasto: 100 }), camp({ nombre: 'Zontes y Suzuki', gasto: 50 }), camp({ nombre: 'Institucional', gasto: 10 })]
    const e = armarEntrada(datosMulti(ps, cs))
    expect(e.publicidad.totales.gasto).toBe(160)
    const a = e.publicidad.atribucion!
    expect(a.porMarca.map((m) => [m.marca, m.gasto])).toEqual([['Suzuki Quilmes', 100], ['Zontes Quilmes', 0]])
    expect(a.compartidas).toMatchObject({ campanias: 1, gasto: 50 })
    expect(a.sinAtribuir).toMatchObject({ campanias: 1, gasto: 10 })
    expect(a.nota).toMatch(/aproximada/i)
  })

  it('mismo conjunto de marcas => mismo hash; otro conjunto => otro hash', () => {
    const h = (f: Filtros) => hashEntrada({ organizacionId: 'org', entrada: armarEntrada(datosMulti(ps, [], [], f)), modelo: 'm' })
    expect(h({ ...multi, marcaIds: [suzuki, zontes] })).toBe(h({ ...multi, marcaIds: [zontes, suzuki] }))
    expect(h(multi)).not.toBe(h({ ...multi, marcaIds: [suzuki, MARCAS[3]!.id] }))
  })

  it('con las 7 marcas y mucho volumen el JSON sigue bajo 22.000 caracteres (peor caso: 7 marcas + hechos)', () => {
    const todas = MARCAS.map((m) => m.id)
    const muchas = Array.from({ length: 500 }, (_, i) => pub({ marcaId: todas[i % 7]!, texto: 'palabra '.repeat(40) }))
    const cs = Array.from({ length: 200 }, (_, i) => camp({ nombre: `${MARCAS[i % 7]!.nombre} ${'n'.repeat(200)}` }))
    const ms = todas.flatMap((id) => [msj({ marcaId: id }), msj({ marcaId: id, plataforma: 'instagram' })])
    const json = JSON.stringify(armarEntrada(datosMulti(muchas, cs, ms, { ...multi, marcaIds: todas })))
    expect(json.length).toBeLessThan(22_000)
  })

  it('no filtra cuentas ni ids con varias marcas (regla #2)', () => {
    const json = JSON.stringify(armarEntrada(datosMulti(ps, [camp({ id: 'SENT_ID', cuenta: 'SENT_CTA' })], [msj({ marcaId: suzuki })])))
    for (const s of ['SENT_ID', 'SENT_CTA', suzuki, zontes, 'permalink']) expect(json).not.toContain(s)
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

describe('armarEntrada · v4 (destacados y hechos)', () => {
  it('trae los destacados resumidos, sin permalinks ni ids, y los hechos citables', () => {
    const e = entradaDePrueba()
    expect(e.destacados.campanias).toMatchObject({ metrica: 'costoPorResultado' })
    expect(e.destacados.publicaciones.mejores[0]).toMatchObject({ plataforma: 'instagram', tipo: 'reel', vistas: 4000, indice: 4 })
    expect(JSON.stringify(e.destacados)).not.toMatch(/perma|instagram\.com|id-post|id-camp/)
    expect(e.hechos.length).toBeGreaterThan(10)
  })

  it('al LLM el índice de un post nunca pasa de 20 y se marca como topado', () => {
    const e = entradaDePrueba()
    expect(e.destacados.publicaciones.mejores.every((x) => x.indice <= 20)).toBe(true)
    expect(e.destacados.publicaciones.mejores[0]).not.toHaveProperty('indiceTopado')
  })

  it('con hechos y destacados el hash sigue siendo estable y cambia con el modelo', () => {
    const h = (modelo: string) => hashEntrada({ organizacionId: 'org', entrada: entradaDePrueba(), modelo })
    expect(h('a')).not.toBe(h('b'))
    expect(h('a')).toBe(h('a'))
  })
})

describe('armarEntrada · v5 (publicaciones con pauta)', () => {
  const conPago = () =>
    entradaDePrueba({
      publicaciones: [
        ...Array.from({ length: 6 }, () => post({ vistas: 1000 })),
        post({ vistas: 907_610, conPauta: true, campaniaPauta: 'Boost Benelli', texto: '¿BUSCÁS CAMBIAR DE MOTO?' }),
        post({ vistas: 50_000, conPauta: true, texto: 'Otro post pago' }),
      ],
    })

  it('lo orgánico no suma los posts pagos: ni vistas, ni cantidad, ni ranking, ni destacados', () => {
    const e = conPago()
    expect(e.organico.resumen.publicaciones).toBe(6)
    expect(e.organico.resumen.vistas).toBe(6000)
    expect(e.organico.mejores.every((p) => p.vistas <= 1000)).toBe(true)
    expect(e.destacados.publicaciones.mejores).toEqual([])
    expect(e.organico.porFormato.reduce((t, f) => t + f.publicaciones, 0)).toBe(6)
  })

  it('organico.conPauta resume cuántas y cuántas vistas, sin filas', () => {
    expect(conPago().organico.conPauta).toEqual({ publicaciones: 2, vistas: 957_610 })
  })

  it('el texto, la campaña y los ids de los posts pagos nunca van al modelo (regla #2)', () => {
    const json = JSON.stringify(conPago())
    expect(json).not.toContain('BUSCÁS CAMBIAR')
    expect(json).not.toContain('Otro post pago')
    expect(json).not.toContain('Boost Benelli')
  })

  it('sin posts pagos no hay organico.conPauta (el payload v4 queda igual)', () => {
    expect(entradaDePrueba().organico).not.toHaveProperty('conPauta')
  })

  it('aclara en las notas que las publicaciones con pauta no se comparan con las orgánicas, solo si hay', () => {
    expect(conPago().notas.join(' ')).toMatch(/pauta/i)
    expect(entradaDePrueba().notas.join(' ')).not.toMatch(/pauta/i)
  })

  it('tener posts pagos cambia el hash (otro payload = otro análisis)', () => {
    const h = (e: ReturnType<typeof conPago>) => hashEntrada({ organizacionId: 'org', entrada: e, modelo: 'm' })
    expect(h(conPago())).not.toBe(h(entradaDePrueba()))
  })
})


describe('armarEntrada · v6 (publicaciones fuera de lo normal)', () => {
  const conAtipicos = () =>
    entradaDePrueba({
      publicaciones: [
        ...Array.from({ length: 6 }, () => post({ vistas: 1000 })),
        post({ vistas: 907_610, texto: 'Post de 900 mil vistas sin anuncio' }),
        post({ vistas: 113_000, texto: 'Otro atípico' }),
      ],
    })

  it('lo orgánico no suma los atípicos: ni vistas, ni cantidad, ni ranking, ni destacados', () => {
    const e = conAtipicos()
    expect(e.organico.resumen.publicaciones).toBe(6)
    expect(e.organico.resumen.vistas).toBe(6000)
    expect(e.organico.mejores.every((p) => p.vistas <= 1000)).toBe(true)
    expect(e.destacados.publicaciones.mejores).toEqual([])
    expect(e.organico.porFormato.reduce((t, f) => t + f.publicaciones, 0)).toBe(6)
  })

  it('organico.atipicos resume cuántos y cuántas vistas, sin filas ni textos', () => {
    const e = conAtipicos()
    expect(e.organico.atipicos).toEqual({ publicaciones: 2, vistas: 1_020_610 })
    const json = JSON.stringify(e)
    expect(json).not.toContain('900 mil vistas')
    expect(json).not.toContain('Otro atípico')
  })

  it('sin atípicos no hay organico.atipicos (el payload queda igual)', () => {
    expect(entradaDePrueba().organico).not.toHaveProperty('atipicos')
  })

  it('un post pago enorme es conPauta, no atípico, y cada uno suma en su lado', () => {
    const e = entradaDePrueba({
      publicaciones: [
        ...Array.from({ length: 6 }, () => post({ vistas: 1000 })),
        post({ vistas: 900_000, conPauta: true }),
        post({ vistas: 800_000 }),
      ],
    })
    expect(e.organico.conPauta).toEqual({ publicaciones: 1, vistas: 900_000 })
    expect(e.organico.atipicos).toEqual({ publicaciones: 1, vistas: 800_000 })
  })

  it('aclara en las notas que los fuera de lo normal no se comparan, solo si hay', () => {
    expect(conAtipicos().notas.join(' ')).toMatch(/fuera de lo normal/i)
    expect(entradaDePrueba().notas.join(' ')).not.toMatch(/fuera de lo normal/i)
  })

  it('los posts sin métricas siguen en los totales pero no entran a los destacados', () => {
    const e = entradaDePrueba({
      publicaciones: [...Array.from({ length: 6 }, () => post({ vistas: 1000 })), post({ vistas: 0 })],
    })
    expect(e.organico.resumen.publicaciones).toBe(7)
    expect(e.destacados.publicaciones.peores).toEqual([])
  })

  it('tener atípicos cambia el hash', () => {
    const h = (e: ReturnType<typeof conAtipicos>) => hashEntrada({ organizacionId: 'org', entrada: e, modelo: 'm' })
    expect(h(conAtipicos())).not.toBe(h(entradaDePrueba()))
  })
})
