'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { ManifiestoLeido } from '@/lib/promocion/logos'
import { REGISTRO_FUENTES, type IdFuente } from '@/lib/promocion/fuentes-placa'
import type { FamiliasDiseno } from './placas/tipos'

/**
 * Lo que las plantillas de diseño necesitan del servidor para dibujarse en el navegador: el manifiesto de logos
 * (qué logo va con cada concesionaria) y las familias de las fuentes (las variables de next/font). Lo pone la
 * pantalla una vez, así no se pasa por cada componente que muestra una placa.
 */
export type ContextoDisenoValor = { manifiesto: ManifiestoLeido | null; familias: FamiliasDiseno }

const SIN_MANIFIESTO: ManifiestoLeido['logo999'] = { carpeta: '', archivo: '', tono: 'color', fondo: 'transparente' }
/** Sin proveedor (tests): los nombres de familia reales y ningún logo de concesionaria. */
export const MANIFIESTO_VACIO: ManifiestoLeido = { logo999: SIN_MANIFIESTO, marcas: {} }
const FAMILIAS_POR_DEFECTO = Object.fromEntries((Object.keys(REGISTRO_FUENTES) as IdFuente[]).map((id) => [id, REGISTRO_FUENTES[id].familia])) as FamiliasDiseno

const Contexto = createContext<ContextoDisenoValor>({ manifiesto: null, familias: FAMILIAS_POR_DEFECTO })

export function ProveedorDiseno({ manifiesto, familias, children }: { manifiesto: ManifiestoLeido; familias: FamiliasDiseno; children: ReactNode }) {
  return <Contexto.Provider value={{ manifiesto, familias }}>{children}</Contexto.Provider>
}

export const useContextoDiseno = (): ContextoDisenoValor => useContext(Contexto)
