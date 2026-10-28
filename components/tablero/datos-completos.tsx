import type { ReactNode } from 'react'

/** Las tablas de siempre, plegadas: nada se borra, solo deja de competir con lo que importa. */
export function DatosCompletos({ children }: { children: ReactNode }) {
  return (
    <details className="rounded-lg border border-(--color-borde) px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium">Ver los datos completos</summary>
      <div className="mt-6 space-y-10">{children}</div>
    </details>
  )
}
