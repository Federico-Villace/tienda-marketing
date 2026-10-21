/**
 * Montos que el modelo no puede inventar. Un precio, una cuota o un porcentaje
 * solo sale en una pieza si está escrito en lo que el modelo recibió (el plan o
 * las notas). Si no, se reemplaza por [precio] y la persona lo completa.
 *
 * El respaldo es por CLAVE normalizada (tipo + cifra), no por texto: "$ 1.500.000"
 * en la pieza queda respaldado por "1500000" en las notas.
 */

import type { Pieza } from './tipos.ts'

export const MARCADOR_PRECIO = '[precio]'

const NUM = String.raw`\d+(?:[.,]\d+)*`
const ESCALA = String.raw`(?:\s?(?:mil|millones|k)\b)`
export const MONTO = new RegExp(
  String.raw`(?<![\p{L}\d])(?:US\$|U\$S|USD|ARS|\$)\s?${NUM}${ESCALA}?` +
    String.raw`|${NUM}\s?%` +
    String.raw`|\d+\s?cuotas\b` +
    String.raw`|${NUM}\s?(?:pesos|d[oó]lares)\b`,
  'giu',
)
const NUMERO_SUELTO = new RegExp(`${NUM}${ESCALA}?`, 'giu')

/** "1.500" y "1,500" son miles; "1,5" y "12.50" son decimales; el resto, solo dígitos. */
function valor(num: string): number {
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(num)) return Number(num.replace(/[.,]/g, ''))
  if (/^\d+[.,]\d{1,2}$/.test(num)) return Number(num.replace(',', '.'))
  return Number(num.replace(/\D/g, ''))
}

function cifra(texto: string): string {
  const num = /\d+(?:[.,]\d+)*/.exec(texto)?.[0] ?? '0'
  const escala = /millones/i.test(texto) ? 1e6 : /(?:mil|k)\b/i.test(texto) ? 1e3 : 1
  return String(Math.round(valor(num) * escala * 100) / 100)
}

/** tipo:cifra, p. ej. "moneda:1500000". */
export function claveDeMonto(m: string): string {
  const tipo = m.includes('%') ? 'porcentaje' : /cuotas/i.test(m) ? 'cuotas' : 'moneda'
  return `${tipo}:${cifra(m)}`
}

function clavesDeFuente(fuente: string): Set<string> {
  const claves = new Set<string>()
  const resto = fuente.replace(MONTO, (m) => {
    claves.add(claveDeMonto(m))
    return ' '
  })
  // Un número suelto ("1500000") respalda un monto en pesos, no un porcentaje ni unas cuotas.
  for (const n of resto.match(NUMERO_SUELTO) ?? []) claves.add(`moneda:${cifra(n)}`)
  return claves
}

export function montosNoRespaldados(texto: string, fuente: string): string[] {
  const claves = clavesDeFuente(fuente)
  return (texto.match(MONTO) ?? []).filter((m) => !claves.has(claveDeMonto(m)))
}

/** Los campos de texto de una pieza, en el orden en que se controlan. */
export const CAMPOS_TEXTO = ['hook', 'copy', 'cta', 'guion', 'briefVisual', 'altText'] as const

export function reemplazarMontos(p: Pieza, fuente: string): Pieza {
  const claves = clavesDeFuente(fuente)
  const limpiar = (t: string) => t.replace(MONTO, (m) => (claves.has(claveDeMonto(m)) ? m : MARCADOR_PRECIO))
  const salida: Pieza = { ...p, hashtags: p.hashtags.map(limpiar) }
  for (const k of CAMPOS_TEXTO) {
    const v = p[k]
    if (typeof v === 'string') (salida as Record<string, unknown>)[k] = limpiar(v)
  }
  return salida
}

export const tienePrecioPendiente = (p: Pieza): boolean =>
  [...CAMPOS_TEXTO.map((k) => p[k]), ...p.hashtags].some((t) => typeof t === 'string' && t.includes(MARCADOR_PRECIO))
