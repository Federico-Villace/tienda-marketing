import type { ReactNode } from 'react'

/**
 * Un bloque secundario plegado (para que el celu no sea una pared de opciones). Es un <details>:
 * el contenido sigue en la página y se abre solo si hay algo que atender (`abierto`, p. ej. un error).
 */
export function Plegable({ titulo, abierto = false, children }: { titulo: string; abierto?: boolean; children: ReactNode }) {
  return (
    <details {...(abierto ? { open: true } : {})} className="rounded-lg border border-(--color-borde) px-4">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">{titulo}</summary>
      <div className="space-y-3 pt-1 pb-3">{children}</div>
    </details>
  )
}
