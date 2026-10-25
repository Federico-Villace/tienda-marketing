/**
 * Lo único que ve el modelo (regla dura #2): agregados, nunca filas.
 *
 * Las filas viajan de Postgres a este servidor; de acá al LLM sale un JSON de
 * pocos miles de caracteres sin ids, permalinks, ids de cuenta ni `crudo`.
 * Cada campo se copia a mano: una columna nueva en la base NO llega al modelo
 * por accidente.
 */

import { createHash } from 'node:crypto'
import {
  agruparPorDiaSemana,
  agruparPorMarca,
  agruparPorPlataforma,
  agruparPorTipo,
  diaSemanaAR,
  ranking,
  resumir,
  type FilaAgrupada,
} from '../datos/agregados.ts'
import type { Filtros } from '../datos/filtros.ts'
import { mensajesDeMarcas, type MensajesCuenta } from '../datos/mensajes.ts'
import { marcaPorId, ordenarMarcas } from '../datos/marcas.ts'
import { atribuirCampanias, totalesPublicidad, type CampaniaReal } from '../datos/publicidad.ts'
import { interaccionesDe, type Publicacion } from '../datos/tipos.ts'
import { VERSION_PROMPT } from './prompt.ts'

export type DatosAnalisis = {
  readonly filtros: Filtros
  /** Ya filtradas por marca, plataforma y fechas. */
  readonly publicaciones: readonly Publicacion[]
  readonly campanias: readonly CampaniaReal[]
  /** Conteos por cuenta del período (resumen_mensajes); se filtran por marca y plataforma acá. */
  readonly mensajes: readonly MensajesCuenta[]
}

type FilaVista = {
  clave: string
  publicaciones: number
  vistasPromedio: number
  interaccionesPromedio: number
  comentariosPromedio: number
  tasaInteraccionPct: number
}

export type EntradaAnalisis = {
  periodo: { desde: string; hasta: string; dias: number }
  /** Nombres, en el orden de MARCAS. */
  filtro: { marcas: string[]; plataforma: string }
  notas: string[]
  organico: {
    resumen: {
      publicaciones: number
      vistas: number
      interacciones: number
      comentarios: number
      alcance: number | null
      clics: number | null
      vistasPromedio: number
      tasaInteraccionPct: number
    }
    porPlataforma: FilaVista[]
    porFormato: FilaVista[]
    porDiaSemana: FilaVista[]
    /** Solo con 2+ marcas: el material del comparativo. */
    porMarca?: FilaVista[]
    mejores: PostVista[]
    peores: PostVista[]
  }
  mensajes: {
    nota: string
    /** Suma de las marcas elegidas. null = sin cuenta en el filtro o sin datos. */
    total: { facebook: MensajesVista | null; instagram: MensajesVista | null }
    /** Solo con 2+ marcas. */
    porMarca?: { marca: string; facebook: MensajesVista | null; instagram: MensajesVista | null }[]
  }
  publicidad: {
    moneda: 'ARS'
    totales: {
      campanias: number
      gasto: number
      impresiones: number
      clics: number
      resultados: number
      ctrPct: number
      costoPorResultado: number | null
    }
    campanias: CampaniaVista[]
    /** Solo con 2+ marcas: la marca sale del NOMBRE de la campaña, es aproximada. */
    atribucion?: {
      nota: string
      porMarca: ({ marca: string } & TotalesVista)[]
      compartidas: TotalesVista
      sinAtribuir: TotalesVista
    }
  }
}

type TotalesVista = { campanias: number; gasto: number; impresiones: number; clics: number; resultados: number }

type MensajesVista = {
  conversacionesActivas: number | null
  conversacionesNuevas: number | null
  /** null = Meta no lo informa (Instagram no da message_count). */
  mensajes: number | null
}

type PostVista = {
  /** Solo con 2+ marcas. */
  marca?: string
  fecha: string
  dia: string
  plataforma: string
  tipo: string
  texto: string
  vistas: number
  interacciones: number
  comentarios: number
}

type CampaniaVista = {
  nombre: string
  objetivo: string
  estado: string
  gasto: number
  impresiones: number
  clics: number
  resultados: number
  ctrPct: number
  costoPorResultado: number | null
}

const TOP_POSTS = 5
const TOP_CAMPANIAS = 10
const MAX_TEXTO_POST = 140
const MAX_NOMBRE_CAMPANIA = 80
const DIA_MS = 24 * 60 * 60 * 1000

const redondear = (n: number): number => Math.round(n * 100) / 100
const redondearONull = (n: number | null): number | null => (n === null ? null : redondear(n))
const porcentaje = (num: number, den: number): number => (den === 0 ? 0 : redondear((num / den) * 100))
const FECHA_AR_MS = 3 * 60 * 60 * 1000
const fechaAR = (d: Date): string => new Date(d.getTime() - FECHA_AR_MS).toISOString().slice(0, 10)

const vistaFila = (f: FilaAgrupada): FilaVista => ({
  clave: f.clave,
  publicaciones: f.publicaciones,
  vistasPromedio: redondear(f.vistasPromedio),
  interaccionesPromedio: redondear(f.interaccionesPromedio),
  comentariosPromedio: redondear(f.comentariosPromedio),
  tasaInteraccionPct: redondear(f.tasaInteraccion * 100),
})

const vistaMensajes = (m: { activas: number | null; nuevas: number | null; mensajes: number | null } | null): MensajesVista | null =>
  m === null ? null : { conversacionesActivas: m.activas, conversacionesNuevas: m.nuevas, mensajes: m.mensajes }

const vistaTotales = (t: TotalesVista): TotalesVista => ({
  campanias: t.campanias,
  gasto: redondear(t.gasto),
  impresiones: t.impresiones,
  clics: t.clics,
  resultados: t.resultados,
})

const nombreDe = (id: string): string => marcaPorId(id)?.nombre ?? 'desconocida'

const vistaPost = (p: Publicacion, conMarca: boolean): PostVista => ({
  ...(conMarca ? { marca: nombreDe(p.marcaId) } : {}),
  fecha: fechaAR(p.publicadoEn),
  dia: diaSemanaAR(p.publicadoEn),
  plataforma: p.plataforma,
  tipo: p.tipo,
  texto: p.texto.slice(0, MAX_TEXTO_POST),
  vistas: p.vistas,
  interacciones: interaccionesDe(p),
  comentarios: p.comentarios,
})

const vistaCampania = (c: CampaniaReal): CampaniaVista => ({
  nombre: c.nombre.slice(0, MAX_NOMBRE_CAMPANIA),
  objetivo: c.objetivo ?? '',
  estado: c.estado ?? '',
  gasto: redondear(c.gasto),
  impresiones: c.impresiones,
  clics: c.clics,
  resultados: c.resultados,
  ctrPct: porcentaje(c.clics, c.impresiones),
  costoPorResultado: c.resultados > 0 ? redondear(c.gasto / c.resultados) : null,
})

export function armarEntrada(d: DatosAnalisis): EntradaAnalisis {
  const r = resumir(d.publicaciones)
  const { mejores, peores } = ranking(d.publicaciones, TOP_POSTS)
  const t = totalesPublicidad(d.campanias)
  const marcaIds = ordenarMarcas(d.filtros.marcaIds)
  const varias = marcaIds.length > 1
  const msj = mensajesDeMarcas(d.mensajes, { marcaIds, plataforma: d.filtros.plataforma })
  const atrib = varias ? atribuirCampanias(d.campanias, marcaIds) : null
  const dias = Math.round((Date.parse(d.filtros.hasta) - Date.parse(d.filtros.desde)) / DIA_MS) + 1

  return {
    periodo: { desde: d.filtros.desde, hasta: d.filtros.hasta, dias },
    filtro: {
      marcas: marcaIds.map(nombreDe),
      plataforma: d.filtros.plataforma,
    },
    notas: [
      'Métricas orgánicas acumuladas desde la publicación hasta la última sync',
      'Publicidad: todas las marcas, montos en ARS',
      'Instagram no informa clics por post; Facebook no informa alcance',
      'Mensajes: conteos por cuenta del período, sin contenido',
    ],
    organico: {
      resumen: {
        publicaciones: r.publicaciones,
        vistas: r.vistas,
        interacciones: r.interacciones,
        comentarios: r.comentarios,
        alcance: r.alcance,
        clics: r.clics,
        vistasPromedio: redondear(r.vistasPromedio),
        tasaInteraccionPct: redondear(r.tasaInteraccion * 100),
      },
      porPlataforma: agruparPorPlataforma(d.publicaciones).map(vistaFila),
      porFormato: agruparPorTipo(d.publicaciones).map(vistaFila),
      porDiaSemana: agruparPorDiaSemana(d.publicaciones).map(vistaFila),
      ...(varias ? { porMarca: agruparPorMarca(d.publicaciones).map(vistaFila) } : {}),
      mejores: mejores.map((p) => vistaPost(p, varias)),
      peores: peores.map((p) => vistaPost(p, varias)),
    },
    mensajes: {
      nota: 'Meta no informa qué publicación originó cada mensaje: son de la cuenta, no de un post',
      total: { facebook: vistaMensajes(msj.total.facebook), instagram: vistaMensajes(msj.total.instagram) },
      ...(varias
        ? {
            porMarca: msj.porMarca.map((m) => ({
              marca: nombreDe(m.marcaId),
              facebook: vistaMensajes(m.facebook),
              instagram: vistaMensajes(m.instagram),
            })),
          }
        : {}),
    },
    publicidad: {
      moneda: 'ARS',
      totales: {
        campanias: t.campanias,
        gasto: redondear(t.gasto),
        impresiones: t.impresiones,
        clics: t.clics,
        resultados: t.resultados,
        ctrPct: porcentaje(t.clics, t.impresiones),
        costoPorResultado: redondearONull(t.costoPorResultado),
      },
      campanias: [...d.campanias]
        .sort((a, b) => b.gasto - a.gasto)
        .slice(0, TOP_CAMPANIAS)
        .map(vistaCampania),
      ...(atrib
        ? {
            atribucion: {
              nota: 'Aproximada: sale del texto del nombre de la campaña, no de una marca real en Meta',
              porMarca: atrib.porMarca.map((m) => ({ marca: nombreDe(m.marcaId), ...vistaTotales(m) })),
              compartidas: vistaTotales(atrib.compartidasTotales),
              sinAtribuir: vistaTotales(atrib.sinAtribuir),
            },
          }
        : {}),
    },
  }
}

/**
 * Llave del caché: mismos datos + mismo prompt + mismo modelo = mismo análisis.
 * El JSON es determinista porque armarEntrada construye los objetos con un
 * orden de claves fijo.
 */
export const hashEntrada = (p: {
  readonly organizacionId: string
  readonly entrada: EntradaAnalisis
  readonly modelo: string
}): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        org: p.organizacionId,
        tipo: 'rendimiento',
        entrada: p.entrada,
        version: VERSION_PROMPT,
        modelo: p.modelo,
      }),
    )
    .digest('hex')
