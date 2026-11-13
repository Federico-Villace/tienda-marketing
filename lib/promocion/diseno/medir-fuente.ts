/**
 * Mide un texto con las métricas REALES de un archivo de fuente (TTF/OTF estático): suma el avance de cada glifo
 * (tablas cmap + hmtx), sin kerning. Solo para tests y para recalcular METRICAS (ajuste.ts) cuando se suma una fuente:
 * lee del disco, así que NUNCA lo importa un componente de navegador.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REGISTRO_FUENTES, type IdFuente } from '../fuentes-placa.ts'

type Medidor = { unidades: number; avance: (codigo: number) => number | null }

const cache = new Map<IdFuente, Medidor>()

function leer(id: IdFuente): Medidor {
  const buf = readFileSync(join(process.cwd(), 'assets/fuentes', REGISTRO_FUENTES[id].archivo))
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const tablas = new Map<string, number>()
  for (let i = 0; i < v.getUint16(4); i++) {
    const o = 12 + i * 16
    tablas.set(String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3)), v.getUint32(o + 8))
  }
  const t = (n: string): number => {
    const o = tablas.get(n)
    if (o === undefined) throw new Error(`Falta la tabla ${n} en ${id}`)
    return o
  }
  const unidades = v.getUint16(t('head') + 18)
  const nMetricas = v.getUint16(t('hhea') + 34)
  const hmtx = t('hmtx')
  const avanceDeGlifo = (g: number) => v.getUint16(hmtx + 4 * Math.min(g, nMetricas - 1))

  // cmap: el subtable Unicode (formato 12 si hay, si no el 4).
  const cmap = t('cmap')
  let f4 = -1
  let f12 = -1
  for (let i = 0; i < v.getUint16(cmap + 2); i++) {
    const o = cmap + v.getUint32(cmap + 4 + i * 8 + 4)
    const fmt = v.getUint16(o)
    if (fmt === 12) f12 = o
    if (fmt === 4 && f4 < 0) f4 = o
  }
  const glifo = (codigo: number): number => {
    if (f12 >= 0) {
      for (let i = 0; i < v.getUint32(f12 + 12); i++) {
        const g = f12 + 16 + i * 12
        if (codigo >= v.getUint32(g) && codigo <= v.getUint32(g + 4)) return v.getUint32(g + 8) + (codigo - v.getUint32(g))
      }
      return 0
    }
    const n = v.getUint16(f4 + 6) / 2
    const fines = f4 + 14
    const inicios = fines + n * 2 + 2
    const deltas = inicios + n * 2
    const rangos = deltas + n * 2
    for (let i = 0; i < n; i++) {
      if (codigo > v.getUint16(fines + i * 2)) continue
      if (codigo < v.getUint16(inicios + i * 2)) return 0
      const off = v.getUint16(rangos + i * 2)
      if (off === 0) return (codigo + v.getInt16(deltas + i * 2)) & 0xffff
      const g = v.getUint16(rangos + i * 2 + off + (codigo - v.getUint16(inicios + i * 2)) * 2)
      return g === 0 ? 0 : (g + v.getInt16(deltas + i * 2)) & 0xffff
    }
    return 0
  }
  return { unidades, avance: (c) => { const g = glifo(c); return g === 0 ? null : avanceDeGlifo(g) } }
}

/** Ancho real de `texto` en unidades de em (multiplicar por el tamaño en px). Lanza si la fuente no tiene algún carácter. */
export function anchoReal(id: IdFuente, texto: string): number {
  let m = cache.get(id)
  if (!m) cache.set(id, (m = leer(id)))
  let total = 0
  for (const c of texto) {
    const a = m.avance(c.codePointAt(0)!)
    if (a === null) throw new Error(`La fuente ${id} no tiene el carácter "${c}"`)
    total += a
  }
  return total / m.unidades
}
