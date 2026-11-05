/**
 * Qué es "plata" en el titular y la línea extra de la placa. El único monto que la placa puede mostrar
 * es el precio (lo dibuja la plantilla). Cuotas, porcentajes, años, cilindrada y km NO son montos: se pueden escribir.
 * Un solo criterio para el servidor (la autoridad) y para la pantalla.
 */

import { claveDeMonto, clavesDeFuente } from '../contenidista/montos.ts'

export const MENSAJE_MONTOS = 'Los montos van solo en el precio. Podés poner cuotas, años, cilindrada o km.'

const NUM = String.raw`\d+(?:[.,]\d+)*`
// Con marca de moneda, con palabra de moneda/escala, o un número suelto (se mira aparte).
const CANDIDATO = new RegExp(
  String.raw`(?<![\p{L}\d])(?:US\$|U\$S|USD|ARS|\$)\s?${NUM}(?:\s?(?:mil|millones|k)\b)?` + String.raw`|(?<![\p{L}\d.,$])${NUM}(?:\s?(?:pesos|d[oó]lares|mil|millones|k)\b)?`,
  'giu',
)
const UNIDAD = /^\s?(?:km|cc)\b/i
const MARCA_DE_DINERO = /^(?:US\$|U\$S|USD|ARS|\$)|(?:pesos|d[oó]lares|mil|millones|k)$/i

function valor(num: string): number {
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(num)) return Number(num.replace(/[.,]/g, ''))
  if (/^\d+[.,]\d{1,2}$/.test(num)) return Number(num.replace(',', '.'))
  return Number(num.replace(/\D/g, ''))
}

/** Un número suelto es plata si llega a 1000 y no es un año ni va pegado a km o cc. */
function sueltoEsPlata(m: string, resto: string): boolean {
  if (UNIDAD.test(resto)) return false
  if (/^\d{4}$/.test(m) && Number(m) >= 1900 && Number(m) <= 2100) return false
  return valor(m) >= 1000
}

/** Los montos de dinero del texto que no están respaldados por `fuente` (p. ej. el precio cargado). */
export function montosDeDineroEnTexto(texto: string, fuente: string): string[] {
  const respaldo = clavesDeFuente(fuente)
  const montos: string[] = []
  for (const hallazgo of texto.matchAll(CANDIDATO)) {
    const m = hallazgo[0]
    const plata = MARCA_DE_DINERO.test(m) || sueltoEsPlata(m, texto.slice(hallazgo.index + m.length))
    if (plata && !respaldo.has(claveDeMonto(m))) montos.push(m)
  }
  return montos
}
