/**
 * Agrupación de versiones inmutables por raíz (planes, piezas): cada edición es
 * una fila nueva que apunta a la misma raíz.
 */

export type Versionada = {
  id: string
  raizId: string
  version: number
  estado: string
  creadoEn: string
}

export type Grupo<T extends Versionada> = {
  raizId: string
  /** De la más nueva a la más vieja. */
  versiones: T[]
  /** La última versión: sobre ella se actúa. */
  punta: T
  /** La versión aprobada de la raíz, aunque la punta sea un borrador posterior. */
  vigente: T | null
}

export function agruparPorRaiz<T extends Versionada>(
  xs: readonly T[],
  esVigente: (x: T) => boolean = (x) => x.estado === 'aprobado',
): Grupo<T>[] {
  const porRaiz = new Map<string, T[]>()
  for (const p of xs) porRaiz.set(p.raizId, [...(porRaiz.get(p.raizId) ?? []), p])
  return [...porRaiz.entries()]
    .map(([raizId, vs]) => {
      const versiones = [...vs].sort((a, b) => b.version - a.version)
      return { raizId, versiones, punta: versiones[0]!, vigente: versiones.find(esVigente) ?? null }
    })
    .sort((a, b) => (a.punta.creadoEn < b.punta.creadoEn ? 1 : a.punta.creadoEn > b.punta.creadoEn ? -1 : 0))
}
