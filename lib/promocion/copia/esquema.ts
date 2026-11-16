/**
 * Parseo estricto de lo que lee el verificador. La respuesta es ENTRADA NO CONFIABLE (la imagen puede traer texto que intente dar órdenes):
 * se arma un objeto NUEVO con solo las claves conocidas. No hay ningún campo de veredicto ni de texto libre más allá de los textos transcritos,
 * que se comparan, nunca se obedecen. Puro.
 */

import { extraerJson } from '../referencia/extraer-json.ts'
import { ROLES_LEIDOS, type Caja01, type Lectura, type RolLeido, type TextoLeido } from './tipos.ts'

export { extraerJson }

const MAX_TEXTOS = 20
const MAX_TEXTO = 120

const esObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const propio = (o: Record<string, unknown>, k: string): unknown => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined)
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n))

function leerTexto(x: unknown): TextoLeido | null {
  if (!esObj(x)) return null
  const bruto = propio(x, 'texto')
  if (typeof bruto !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const texto = bruto.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXTO).trim()
  if (texto === '') return null
  const rol = propio(x, 'rol')
  const dudoso = propio(x, 'dudoso')
  return {
    texto,
    rol: typeof rol === 'string' && (ROLES_LEIDOS as readonly string[]).includes(rol) ? (rol as RolLeido) : 'otro',
    dudoso: typeof dudoso === 'boolean' ? dudoso : true,
  }
}

function leerCajaLogo(x: unknown): Caja01 | null {
  if (!esObj(x)) return null
  const [cx, cy, cw, ch] = [num(propio(x, 'x')), num(propio(x, 'y')), num(propio(x, 'w')), num(propio(x, 'h'))]
  if (cx === null || cy === null || cw === null || ch === null || cw <= 0 || ch <= 0) return null
  return { x: clamp01(cx), y: clamp01(cy), w: clamp01(cw), h: clamp01(ch) }
}

/** null = no es una lectura (el verificador falló: el estado es 'error', nunca 'ok'). */
export function leerVerificacion(x: unknown): Lectura | null {
  if (!esObj(x)) return null
  const textos = propio(x, 'textos')
  if (!Array.isArray(textos)) return null
  const fondo = propio(x, 'fondo_logo')
  return {
    textos: textos.map(leerTexto).filter((t): t is TextoLeido => t !== null).slice(0, MAX_TEXTOS),
    logo: leerCajaLogo(propio(x, 'logo')),
    fondoLogo: fondo === 'claro' || fondo === 'oscuro' ? fondo : null,
  }
}
