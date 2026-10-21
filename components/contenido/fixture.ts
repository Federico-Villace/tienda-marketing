import type { GrupoPieza } from '@/lib/contenidista/pantalla'
import { piezasDePrueba } from '@/lib/contenidista/fixture'
import type { PiezaVista, TandaVista } from '@/lib/contenidista/tipos'

/** Una versión de pieza lista para los tests de los componentes de /contenido. */
export const piezaVista = (o: Partial<PiezaVista> = {}): PiezaVista => ({
  id: 'pz1', raizId: 'pz1', padreId: null, version: 1, origen: 'agente', estado: 'borrador', tandaId: 't1', planId: 'p1',
  semana: 1, orden: 1, pieza: piezasDePrueba()[1]!, creadoEn: '2026-10-21T10:00:00Z', aprobadoEn: null, ...o,
})

export const tandaVista = (o: Partial<TandaVista> = {}): TandaVista => ({
  id: 't1', planId: 'p1', semana: 1, notas: null, modelo: 'gpt-6-luna', costoUsd: 0.0021, creadoEn: '2026-10-21T10:00:00Z', desdeCache: false, ...o,
})

/** Un grupo con las versiones dadas (la primera es la punta). */
export const grupoDe = (...versiones: PiezaVista[]): GrupoPieza => ({
  raizId: versiones[0]!.raizId,
  versiones,
  punta: versiones[0]!,
  vigente: versiones.find((v) => v.estado === 'aprobada') ?? null,
})
