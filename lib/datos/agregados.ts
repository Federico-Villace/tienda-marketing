/**
 * Agregados.
 *
 * Esto es lo ÚNICO que ve el LLM: nunca filas crudas. Un mes de publicaciones
 * pasa de ~40.000 tokens a ~1.500, y el modelo interpreta en vez de perderse
 * en el ruido.
 *
 * En producción el cálculo se baja a SQL — Postgres suma gratis y sin alucinar.
 * Acá vive la misma lógica en TypeScript, que es la que está testeada y la que
 * define el contrato de lo que el Analista va a recibir.
 */

import { interaccionesDe, type Publicacion } from './tipos'

export type ResumenPeriodo = {
  readonly publicaciones: number
  readonly vistas: number
  readonly interacciones: number
  readonly vistasPromedio: number
  readonly tasaInteraccion: number
}

export type FilaAgrupada = {
  readonly clave: string
  readonly publicaciones: number
  readonly vistasPromedio: number
  readonly interaccionesPromedio: number
  readonly tasaInteraccion: number
}

/** Toda división del módulo pasa por acá: sin datos, cero. Nunca NaN. */
const dividir = (numerador: number, denominador: number): number =>
  denominador === 0 ? 0 : numerador / denominador

export function resumir(publicaciones: readonly Publicacion[]): ResumenPeriodo {
  const vistas = publicaciones.reduce((total, p) => total + p.vistas, 0)
  const interacciones = publicaciones.reduce(
    (total, p) => total + interaccionesDe(p),
    0,
  )

  return {
    publicaciones: publicaciones.length,
    vistas,
    interacciones,
    vistasPromedio: dividir(vistas, publicaciones.length),
    tasaInteraccion: dividir(interacciones, vistas),
  }
}

/**
 * Agrupa por una clave y ordena de mejor a peor por vistas promedio.
 * Solo aparecen las claves presentes: no se inventan grupos vacíos.
 */
function agrupar(
  publicaciones: readonly Publicacion[],
  clavePara: (p: Publicacion) => string,
): FilaAgrupada[] {
  const grupos = new Map<string, Publicacion[]>()

  for (const p of publicaciones) {
    const clave = clavePara(p)
    const actual = grupos.get(clave)
    if (actual) actual.push(p)
    else grupos.set(clave, [p])
  }

  return [...grupos.entries()]
    .map(([clave, delGrupo]) => {
      const resumen = resumir(delGrupo)
      return {
        clave,
        publicaciones: resumen.publicaciones,
        vistasPromedio: resumen.vistasPromedio,
        interaccionesPromedio: dividir(
          resumen.interacciones,
          resumen.publicaciones,
        ),
        tasaInteraccion: resumen.tasaInteraccion,
      }
    })
    .sort((a, b) => b.vistasPromedio - a.vistasPromedio)
}

export const agruparPorTipo = (
  publicaciones: readonly Publicacion[],
): FilaAgrupada[] => agrupar(publicaciones, (p) => p.tipo)

const DIAS = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
] as const

export const agruparPorDiaSemana = (
  publicaciones: readonly Publicacion[],
): FilaAgrupada[] =>
  agrupar(publicaciones, (p) => DIAS[p.publicadoEn.getUTCDay()] ?? 'desconocido')

export type Ranking = {
  readonly mejores: readonly Publicacion[]
  readonly peores: readonly Publicacion[]
}

/**
 * Las N mejores y las N peores por vistas. Es el material más útil para el
 * Analista: el contraste entre extremos explica más que cualquier promedio.
 */
export function ranking(
  publicaciones: readonly Publicacion[],
  cantidad: number,
): Ranking {
  const ordenadas = [...publicaciones].sort((a, b) => b.vistas - a.vistas)

  return {
    mejores: ordenadas.slice(0, cantidad),
    peores: [...ordenadas].reverse().slice(0, cantidad),
  }
}
