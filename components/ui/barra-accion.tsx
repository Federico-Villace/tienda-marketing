import type { ReactNode } from 'react'

/**
 * La acción principal del paso (Seguir, Aprobar, Crear…). En el celu queda fija abajo de la pantalla,
 * con lugar para la barra del iPhone, para no tener que scrollear hasta el final; desde lg es un
 * renglón común dentro de la página. Una sola por pantalla. NUNCA lleva "Confirmar US$": esa va junto
 * al precio, a la vista. La página que la usa deja `pb-24 lg:pb-0` para que no tape el final.
 */
export function BarraAccion({ children }: { children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label="Acción principal"
      data-testid="barra-accion"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-(--color-borde) bg-(--color-papel) px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 lg:justify-start">{children}</div>
    </div>
  )
}
