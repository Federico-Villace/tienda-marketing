import type { ReactNode } from 'react'

/**
 * Pantalla de edición en dos columnas: a la izquierda los controles y a la derecha la
 * vista previa, que en escritorio queda fija mientras se scrollean los controles. En el
 * celu es una sola columna (la vista previa va después de los controles y se renderiza UNA
 * sola vez). Solo maqueta: no sabe nada de lo que lleva adentro.
 */
export function EditorConVistaPrevia({
  controles,
  previa,
  etiquetaPrevia = 'Vista previa',
}: {
  controles: ReactNode
  previa: ReactNode
  etiquetaPrevia?: string
}) {
  return (
    <div data-testid="editor-con-vista-previa" className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,440px)]">
      <section aria-label="Controles" className="min-w-0 space-y-8">
        {controles}
      </section>
      <aside
        aria-label={etiquetaPrevia}
        data-testid="vista-previa-fija"
        className="min-w-0 space-y-3 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-auto"
      >
        {previa}
      </aside>
    </div>
  )
}
