/**
 * Los "hechos" del payload v4: cifras con nombre y muestra, generadas de forma
 * determinista a partir de los agregados que ya van al modelo.
 *
 * El modelo no escribe números de respaldo: CITA ids de hechos y la UI muestra el valor
 * del payload (ADR-033). Así un número que se ve como "dato de origen" nunca sale del
 * modelo. Los ids son 'h1'.. por posición: el mismo payload da siempre los mismos ids,
 * y como el payload se guarda (analisis.entrada) se pueden revalidar después.
 */

import type { EntradaAnalisis } from './entrada.ts'

export type Hecho = {
  readonly id: string
  /** Qué mide, en palabras de Julián. */
  readonly que: string
  readonly valor: number
  readonly unidad: string
  /** Con cuántos datos se calculó: de ahí sale la confianza. */
  readonly muestra: { readonly cantidad: number; readonly unidad: string } | null
}

export const MAX_HECHOS = 90
/** Los nombres de campaña en un hecho van cortos: son solo la etiqueta del dato. */
const MAX_NOMBRE = 40
export const corto = (t: string): string => (t.length > MAX_NOMBRE ? `${t.slice(0, MAX_NOMBRE)}…` : t)

export type EntradaSinHechos = Omit<EntradaAnalisis, 'hechos'>

type Borrador = Omit<Hecho, 'id'>

export function armarHechos(e: EntradaSinHechos): Hecho[] {
  const hs: Borrador[] = []
  const agregar = (que: string, valor: number | null, unidad: string, muestra: Borrador['muestra']) => {
    if (valor !== null && Number.isFinite(valor)) hs.push({ que, valor, unidad, muestra })
  }
  const org = e.organico

  const r = org.resumen
  const deLasPublicaciones = { cantidad: r.publicaciones, unidad: 'publicaciones' }
  agregar('Publicaciones del período', r.publicaciones, 'publicaciones', deLasPublicaciones)
  agregar('Vistas totales', r.vistas, 'vistas', deLasPublicaciones)
  agregar('Vistas promedio por publicación', r.vistasPromedio, 'vistas', deLasPublicaciones)
  agregar('Tasa de interacción del período', r.tasaInteraccionPct, '%', deLasPublicaciones)
  agregar('Comentarios totales', r.comentarios, 'comentarios', deLasPublicaciones)
  agregar('Alcance total (solo posts que lo informan)', r.alcance, 'personas', deLasPublicaciones)
  agregar('Clics totales (solo posts que lo informan)', r.clics, 'clics', deLasPublicaciones)

  const grupos: [string, typeof org.porFormato][] = [
    ['plataforma', org.porPlataforma],
    ['formato', org.porFormato],
    ['día de la semana', org.porDiaSemana],
    ['marca', org.porMarca ?? []],
  ]
  for (const [rotulo, filas] of grupos) {
    for (const f of filas) {
      const muestra = { cantidad: f.publicaciones, unidad: 'publicaciones' }
      agregar(`Vistas promedio por publicación · ${rotulo} ${f.clave}`, f.vistasPromedio, 'vistas', muestra)
      if (rotulo !== 'día de la semana' && rotulo !== 'marca') {
        agregar(`Tasa de interacción · ${rotulo} ${f.clave}`, f.tasaInteraccionPct, '%', muestra)
      }
    }
  }

  const cuentas = [
    ['Facebook', e.mensajes.total.facebook],
    ['Instagram', e.mensajes.total.instagram],
  ] as const
  for (const [red, m] of cuentas) {
    if (!m) continue
    const muestra = m.conversacionesActivas === null ? null : { cantidad: m.conversacionesActivas, unidad: 'conversaciones' }
    agregar(`Conversaciones activas en ${red}`, m.conversacionesActivas, 'conversaciones', muestra)
    agregar(`Conversaciones nuevas en ${red}`, m.conversacionesNuevas, 'conversaciones', muestra)
    agregar(`Mensajes en ${red}`, m.mensajes, 'mensajes', muestra)
  }

  const p = e.publicidad.totales
  agregar('Gasto publicitario total', p.gasto, 'ARS', { cantidad: p.impresiones, unidad: 'impresiones' })
  agregar('Resultados de publicidad (mensajes y leads)', p.resultados, 'resultados', { cantidad: p.resultados, unidad: 'resultados' })
  agregar('Costo por resultado de toda la publicidad', p.costoPorResultado, 'ARS', { cantidad: p.resultados, unidad: 'resultados' })
  agregar('CTR de toda la publicidad', p.ctrPct, '%', { cantidad: p.impresiones, unidad: 'impresiones' })

  for (const c of e.publicidad.campanias) {
    agregar(`Gasto de la campaña "${corto(c.nombre)}"`, c.gasto, 'ARS', { cantidad: c.impresiones, unidad: 'impresiones' })
    agregar(`Costo por resultado de la campaña "${corto(c.nombre)}"`, c.costoPorResultado, 'ARS', { cantidad: c.resultados, unidad: 'resultados' })
  }

  const dc = e.destacados.campanias
  if (dc) {
    const medida = TITULOS_METRICA[dc.metrica]
    for (const [lado, lista] of [['Mejor', dc.mejores], ['Peor', dc.peores]] as const) {
      for (const x of lista) {
        agregar(`${lado} campaña por ${medida}: "${corto(x.nombre)}"`, x.valor, 'ARS', { cantidad: x.muestra, unidad: UNIDAD_MUESTRA[dc.metrica] })
      }
    }
  }
  for (const x of dc?.sinResultados ?? []) {
    agregar(`Gasto de la campaña sin mensajes ni leads "${corto(x.nombre)}"`, x.gasto, 'ARS', null)
  }
  for (const [lado, lista] of [['Mejor', e.destacados.publicaciones.mejores], ['Peor', e.destacados.publicaciones.peores]] as const) {
    for (const x of lista) {
      agregar(
        `${lado} publicación (${x.tipo} de ${x.plataforma}${x.marca ? ` de ${x.marca}` : ''}, ${x.fecha}) contra lo habitual de su cuenta`,
        x.indice,
        '× lo habitual',
        { cantidad: x.cuentaPublicaciones, unidad: 'publicaciones' },
      )
    }
  }

  return hs.slice(0, MAX_HECHOS).map((h, i) => ({ id: `h${i + 1}`, ...h }))
}

const TITULOS_METRICA = {
  costoPorResultado: 'costo por mensaje o lead',
  costoPorClic: 'costo por clic',
  cpm: 'costo cada mil impresiones',
} as const

const UNIDAD_MUESTRA = { costoPorResultado: 'resultados', costoPorClic: 'clics', cpm: 'impresiones' } as const

export const indiceHechos = (hs: readonly Hecho[]): ReadonlyMap<string, Hecho> => new Map(hs.map((h) => [h.id, h]))
