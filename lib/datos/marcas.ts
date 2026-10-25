/**
 * Las 7 marcas del cliente piloto. Las páginas y cuentas de Instagram son las
 * REALES (sondeo de me/accounts, ADR-016). Son estáticas en el MVP; en la fase 4
 * (multi-tenant) salen de la base.
 *
 * `id` es el id de la página de Facebook; `igId`, el de su Instagram vinculado.
 */

import type { Marca } from './tipos'

export const MARCAS: readonly Marca[] = [
  { id: '696225363810951', igId: '17841403013059872', nombre: '999motos', usuarioIg: '999motos', paginaFb: '999motos' },
  { id: '1322217014300342', igId: '17841474862731536', nombre: 'Motoplex Quilmes', usuarioIg: 'motoplex.quilmes', paginaFb: 'Motoplex Quilmes' },
  { id: '100206789578448', igId: '17841452499288122', nombre: 'Suzuki Quilmes', usuarioIg: 'suzukiquilmescentro', paginaFb: 'Suzuki Quilmes' },
  { id: '1838303613073060', igId: '17841404218354807', nombre: 'Benelli Store Quilmes', usuarioIg: 'benellistorequilmes', paginaFb: 'Benelli Store Quilmes' },
  { id: '1018745801320840', igId: '17841478962746496', nombre: 'QJ Motor Quilmes', usuarioIg: 'qjmotor.quilmes', paginaFb: 'QJ Motor Quilmes' },
  { id: '1327958853726987', igId: '17841436179087906', nombre: 'Zontes Quilmes', usuarioIg: 'zontes.quilmes', paginaFb: 'Zontes Quilmes' },
  { id: '848683938337644', igId: '17841476085004578', nombre: 'MotoMorini Quilmes', usuarioIg: 'motomorini.quilmes', paginaFb: 'MotoMorini Quilmes' },
]

/** La marca dueña de una cuenta de Meta: sirve el id de la página o el de su IG. */
export const marcaDeCuenta = (metaId: string): Marca | undefined =>
  MARCAS.find((m) => m.id === metaId || m.igId === metaId)

export const marcaPorId = (id: string): Marca | undefined => MARCAS.find((m) => m.id === id)

/**
 * Minúsculas, sin tildes y solo [a-z0-9]. Es la MISMA normalización que hace el
 * SQL de resumen_promocion al buscar el token de una marca en el nombre de una
 * campaña: si una cambia, la otra también.
 */
export const normalizarTexto = (x: string): string =>
  x
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const PALABRAS_QUE_NO_IDENTIFICAN = /\b(quilmes|store)\b/gi

/** "Benelli Store Quilmes" → "benelli"; "QJ Motor Quilmes" → "qjmotor". */
export const tokenDeMarca = (m: Marca): string => normalizarTexto(m.nombre.replace(PALABRAS_QUE_NO_IDENTIFICAN, ''))

/** Ids de Meta de las cuentas orgánicas de la marca. */
export const cuentasDeMarca = (m: Marca): string[] => [m.id, m.igId]

/** Ids válidos, sin repetir y en el orden de MARCAS (no el de la URL). */
export const ordenarMarcas = (ids: readonly string[]): string[] =>
  MARCAS.filter((m) => ids.includes(m.id)).map((m) => m.id)

/** "Zontes", "A y B", "A, B y C", "4 marcas", "Todas las marcas". */
export function rotuloMarcas(ids: readonly string[]): string {
  const validas = ordenarMarcas(ids)
  if (validas.length === 0) return '—'
  if (validas.length === MARCAS.length) return 'Todas las marcas'
  if (validas.length > 3) return `${validas.length} marcas`
  const nombres = validas.map((id) => marcaPorId(id)!.nombre)
  return nombres.length === 1 ? nombres[0]! : `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`
}
