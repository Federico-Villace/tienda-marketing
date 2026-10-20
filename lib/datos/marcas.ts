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
