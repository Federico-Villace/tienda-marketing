/**
 * Cómo se arma la lista de /promocionar (ADR-031): pestañas, tandas como una sola fila,
 * orden y páginas. Todo puro: la lectura (pantalla.ts) trae las filas y esto decide qué
 * se ve. Entrada no confiable (`ver` y `pagina` vienen de la URL).
 */

import { MARCAS } from '../datos/marcas.ts'
import type { FiltrosLista } from './filtros-lista.ts'
import { filtrarLista } from './filtros-lista.ts'
import { rotuloLote } from './lote/grupos.ts'
import type { TipoTanda } from './lote/tipos.ts'
import type { ItemLista } from './pantalla.ts'

export const POR_PAGINA = 20

export type Ver = 'terminar' | 'historial' | 'descartadas'
const VERES: readonly Ver[] = ['terminar', 'historial', 'descartadas']

type Param = string | string[] | undefined
const primero = (p: Param) => (typeof p === 'string' ? p : p?.[0])

export function parsearVista(p: { ver?: Param; pagina?: Param }): { ver: Ver; pagina: number } {
  const ver = VERES.find((v) => v === primero(p.ver)) ?? 'terminar'
  const n = Number.parseInt(primero(p.pagina) ?? '', 10)
  return { ver, pagina: Number.isFinite(n) && n >= 1 ? n : 1 }
}

export type EntradaTanda = {
  tipo: 'tanda'
  id: string
  items: ItemLista[]
  actualizadoEn: string
  /** De marcas, de motos o de textos (ADR-032). */
  tipoTanda: TipoTanda
  /** Lo que dice la fila: "5 motos · Benelli", "4 motos × 2 marcas", "TRK 502 · 3 textos". */
  rotulo: string
}
export type EntradaSuelta = { tipo: 'suelta'; item: ItemLista; actualizadoEn: string }
export type Entrada = EntradaSuelta | EntradaTanda

export type VistaLista = {
  totales: Record<Ver, number>
  /** Solo las de la página pedida. */
  entradas: Entrada[]
  pagina: number
  paginas: number
}

const masReciente = (a: string, b: string) => (new Date(a).getTime() >= new Date(b).getTime() ? a : b)

/** Junta las hijas de cada tanda en una entrada; el resto queda suelto. Ordena por lo más reciente. */
function agrupar(items: readonly ItemLista[]): Entrada[] {
  const salida: Entrada[] = []
  const tandas = new Map<string, EntradaTanda>()
  for (const x of items) {
    if (x.tandaId === null) {
      salida.push({ tipo: 'suelta', item: x, actualizadoEn: x.actualizadoEn })
      continue
    }
    const t = tandas.get(x.tandaId)
    if (t) {
      t.items.push(x)
      t.actualizadoEn = masReciente(t.actualizadoEn, x.actualizadoEn)
    } else {
      const nueva: EntradaTanda = { tipo: 'tanda', id: x.tandaId, items: [x], actualizadoEn: x.actualizadoEn, tipoTanda: x.tipoTanda ?? 'marcas', rotulo: '' }
      tandas.set(x.tandaId, nueva)
      salida.push(nueva)
    }
  }
  for (const e of tandas.values()) {
    e.rotulo = rotuloLote(e.tipoTanda, e.items.map((i) => ({ modelo: i.modelo, marca_id: i.marcaId, grupo: i.grupo, variante: i.variante })))
  }
  return salida.sort((a, b) => new Date(b.actualizadoEn).getTime() - new Date(a.actualizadoEn).getTime())
}

/** Una tanda está "para terminar" mientras al menos una hija sea borrador. */
const paraTerminar = (e: Entrada) => (e.tipo === 'suelta' ? e.item.estado === 'borrador' : e.items.some((x) => x.estado === 'borrador'))

export function armarVista(
  lista: { borradores: readonly ItemLista[]; aprobadas: readonly ItemLista[]; descartadas: readonly ItemLista[] },
  filtros: FiltrosLista,
  ver: Ver,
  pagina: number,
): VistaLista {
  // Se agrupa ANTES de separar por estado: una tanda se cuenta y se muestra una sola vez.
  const vivas = agrupar(filtrarLista([...lista.borradores, ...lista.aprobadas], filtros))
  const porVer: Record<Ver, Entrada[]> = {
    terminar: vivas.filter(paraTerminar),
    historial: vivas.filter((e) => !paraTerminar(e)),
    descartadas: agrupar(filtrarLista(lista.descartadas, filtros)),
  }
  const elegidas = porVer[ver]
  const paginas = Math.max(1, Math.ceil(elegidas.length / POR_PAGINA))
  const actual = Math.min(Math.max(1, pagina), paginas)
  return {
    totales: { terminar: porVer.terminar.length, historial: porVer.historial.length, descartadas: porVer.descartadas.length },
    entradas: elegidas.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA),
    pagina: actual,
    paginas,
  }
}

/** El link a una pestaña/página conservando los filtros. Lo que es default no viaja. */
export function urlLista(filtros: FiltrosLista, ver: Ver, pagina: number): string {
  const q = new URLSearchParams()
  if (filtros.marcaIds.length < MARCAS.length) for (const m of filtros.marcaIds) q.append('marca', m)
  if (filtros.modelo) q.set('modelo', filtros.modelo)
  if (ver !== 'terminar') q.set('ver', ver)
  if (pagina > 1) q.set('pagina', String(pagina))
  const s = q.toString()
  return s ? `/promocionar?${s}` : '/promocionar'
}

const ZONA = 'America/Argentina/Buenos_Aires'
const dia = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: ZONA })

/** "recién", "hace 5 min", "hace 3 h", "ayer", "hace 4 días" y, pasada una semana, "1 sep". */
export function fechaRelativa(iso: string, ahora: number): string {
  const t = new Date(iso).getTime()
  const seg = Math.max(0, Math.round((ahora - t) / 1000))
  if (seg < 60) return 'recién'
  if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`
  if (seg < 86400 && dia(t) === dia(ahora)) return `hace ${Math.floor(seg / 3600)} h`
  const dias = Math.round((new Date(dia(ahora)).getTime() - new Date(dia(t)).getTime()) / 86400000)
  if (dias <= 1) return 'ayer'
  if (dias < 7) return `hace ${dias} días`
  return new Date(t).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: ZONA }).replace('.', '')
}
