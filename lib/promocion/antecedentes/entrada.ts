/**
 * Lo único que ve el modelo en el paso 2 (regla dura #2): agregados, nunca filas.
 *
 * Postgres ya los sumó (resumen_promocion); acá cada campo se copia a mano,
 * redondeado: una columna nueva en la RPC NO llega al modelo por accidente. No
 * hay ids, permalinks ni el precio de la promoción (no hace falta para saber qué
 * rindió).
 */

import { hashJson } from '../../agentes/hash.ts'
import type { FilaComparacion, ResumenPromocion } from '../../datos/promocion.ts'
import type { DatosPromocion } from '../tipos.ts'
import { VERSION_PROMPT } from './prompt.ts'

const MAX_TEXTO_POST = 140
const MAX_NOMBRE_CAMPANIA = 80
const DIA_MS = 24 * 60 * 60 * 1000

const redondear = (n: number): number => Math.round(n * 100) / 100
const redondearONull = (n: number | null | undefined): number | null => (n === null || n === undefined ? null : redondear(n))
const pct = (n: number | null | undefined): number | null => (n === null || n === undefined ? null : redondear(n * 100))
const porcentaje = (num: number, den: number): number => (den === 0 ? 0 : redondear((num / den) * 100))

export type EntradaPromocion = {
  periodo: { desde: string; hasta: string; dias: number }
  promocion: { marca: string; modelo: string; tipoPromo: string; detallePromo: string }
  modeloFiltrable: boolean
  notas: string[]
  publicaciones: number
  organico: {
    mencionaModelo: boolean
    plataforma: string
    tipo: string
    publicaciones: number
    vistas: number
    interaccionesPromedio: number
    comentariosPromedio: number
    tasaInteraccionPct: number | null
  }[]
  porPromo: { promo: string; publicaciones: number; vistas: number; interaccionesPromedio: number; tasaInteraccionPct: number | null }[]
  mejores: { fecha: string; plataforma: string; tipo: string; mencionaModelo: boolean; texto: string; vistas: number; interacciones: number }[]
  /** Solo si la promoción es de una tanda (o se pidió comparar): una fila por marca × modelo, copiada campo a campo. */
  comparacion?: FilaComparacion[]
  campanias: {
    totales: { campanias: number; gasto: number; impresiones: number; clics: number; resultados: number; ctrPct: number }
    top: {
      nombre: string
      mencionaModelo: boolean
      gasto: number
      impresiones: number
      clics: number
      resultados: number
      ctrPct: number
      costoPorResultado: number | null
    }[]
  }
}

export type DatosEntradaPromocion = {
  /** Nombre de la marca (ej. "Benelli Store Quilmes"). */
  marca: string
  modelo: string
  datos: DatosPromocion
  periodo: { desde: string; hasta: string }
  /** Lo que sumó Postgres para varias marcas (resumen_promocion_comparado), ya resumido. */
  comparacion?: readonly FilaComparacion[]
}

/** 7 marcas × 3 modelos. */
const MAX_FILAS_COMPARACION = 21

export function armarEntradaPromocion(r: ResumenPromocion, d: DatosEntradaPromocion): EntradaPromocion {
  const t = r.campanias.totales
  const dias = Math.round((Date.parse(d.periodo.hasta) - Date.parse(d.periodo.desde)) / DIA_MS) + 1
  return {
    periodo: { desde: d.periodo.desde, hasta: d.periodo.hasta, dias },
    promocion: { marca: d.marca, modelo: d.modelo, tipoPromo: d.datos.promo.tipo, detallePromo: d.datos.promo.detalle },
    modeloFiltrable: r.modeloFiltrable,
    notas: [
      'Métricas orgánicas acumuladas desde la publicación hasta la última sync',
      'Solo las cuentas de esta marca; la mención del modelo se busca en el texto de cada publicación',
      'Campañas: hay una sola cuenta publicitaria para todas las marcas; solo figuran las que mencionan la marca o el modelo en el nombre',
      ...(r.modeloFiltrable ? [] : ['El nombre del modelo es demasiado corto: no se pudo filtrar por modelo']),
    ],
    publicaciones: r.publicaciones,
    organico: r.organico.map((x) => ({
      mencionaModelo: x.mencionaModelo,
      plataforma: x.plataforma,
      tipo: x.tipo,
      publicaciones: x.publicaciones,
      vistas: x.vistas,
      interaccionesPromedio: redondear(x.interaccionesPromedio),
      comentariosPromedio: redondear(x.comentariosPromedio),
      tasaInteraccionPct: pct(x.tasaInteraccion),
    })),
    porPromo: r.porPromo.map((x) => ({
      promo: x.promo,
      publicaciones: x.publicaciones,
      vistas: x.vistas,
      interaccionesPromedio: redondear(x.interaccionesPromedio),
      tasaInteraccionPct: pct(x.tasaInteraccion),
    })),
    mejores: r.mejores.map((x) => ({
      fecha: x.fecha,
      plataforma: x.plataforma,
      tipo: x.tipo,
      mencionaModelo: x.mencionaModelo,
      texto: x.texto.slice(0, MAX_TEXTO_POST),
      vistas: x.vistas,
      interacciones: x.interacciones,
    })),
    ...(d.comparacion && d.comparacion.length > 0
      ? {
          comparacion: d.comparacion.slice(0, MAX_FILAS_COMPARACION).map((c) => ({
            marca: c.marca,
            modelo: c.modelo,
            publicaciones: c.publicaciones,
            vistasPromedio: redondear(c.vistasPromedio),
            tasaInteraccionPct: redondearONull(c.tasaInteraccionPct),
            mencionanModelo: c.mencionanModelo,
            gastoAtribuido: redondear(c.gastoAtribuido),
          })),
        }
      : {}),
    campanias: {
      totales: {
        campanias: t.campanias,
        gasto: redondear(t.gasto),
        impresiones: t.impresiones,
        clics: t.clics,
        resultados: t.resultados,
        ctrPct: porcentaje(t.clics, t.impresiones),
      },
      top: r.campanias.top.map((c) => ({
        nombre: c.nombre.slice(0, MAX_NOMBRE_CAMPANIA),
        mencionaModelo: c.mencionaModelo,
        gasto: redondear(c.gasto),
        impresiones: c.impresiones,
        clics: c.clics,
        resultados: c.resultados,
        ctrPct: porcentaje(c.clics, c.impresiones),
        costoPorResultado: c.resultados > 0 ? redondearONull(c.gasto / c.resultados) : null,
      })),
    },
  }
}

/** Llave del caché: mismos datos + mismo prompt + mismo modelo = mismo análisis, sin cobrar de nuevo. */
export const hashEntradaPromocion = (p: { organizacionId: string; entrada: EntradaPromocion; modelo: string }): string =>
  hashJson({ org: p.organizacionId, tipo: 'promocion', entrada: p.entrada, version: VERSION_PROMPT, modelo: p.modelo })
