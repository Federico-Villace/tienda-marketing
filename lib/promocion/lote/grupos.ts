/**
 * Cómo se agrupan las hijas de una tanda (ADR-032): en un lote de motos cada moto es un
 * grupo (varias marcas, una escena); en las demás hay un único grupo. Puro.
 */

import { marcaPorId } from '../../datos/marcas.ts'
import type { TipoTanda } from './tipos.ts'

type Hija = { readonly modelo: string; readonly marca_id: string; readonly grupo: number | null; readonly variante: number | null }

export type GrupoDeTanda<H extends Hija> = { grupo: number | null; modelo: string; hijas: H[] }

/** Los grupos por orden de moto; sin grupo (tanda de marcas o de textos) hay uno solo. */
export function gruposDeTanda<H extends Hija>(hijas: readonly H[]): GrupoDeTanda<H>[] {
  const porGrupo = new Map<number | null, GrupoDeTanda<H>>()
  for (const h of hijas) {
    const g = porGrupo.get(h.grupo)
    if (g) g.hijas.push(h)
    else porGrupo.set(h.grupo, { grupo: h.grupo, modelo: h.modelo, hijas: [h] })
  }
  return [...porGrupo.values()].sort((a, b) => (a.grupo ?? 0) - (b.grupo ?? 0))
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** "5 motos · Benelli Store Quilmes", "4 motos × 2 marcas", "TRK 502 · 3 textos", "TRK 502 · 3 marcas". */
export function rotuloLote(tipo: TipoTanda, hijas: readonly Hija[]): string {
  const marcas = new Set(hijas.map((h) => h.marca_id))
  if (tipo === 'motos') {
    const motos = plural(new Set(hijas.map((h) => h.grupo)).size, 'moto', 'motos')
    if (marcas.size > 1) return `${motos} × ${marcas.size} marcas`
    return `${motos} · ${marcaPorId([...marcas][0] ?? '')?.nombre ?? '—'}`
  }
  const modelo = hijas[0]?.modelo ?? '—'
  if (tipo === 'textos') return `${modelo} · ${plural(new Set(hijas.map((h) => h.variante)).size, 'texto', 'textos')}`
  return `${modelo} · ${plural(marcas.size, 'marca', 'marcas')}`
}
