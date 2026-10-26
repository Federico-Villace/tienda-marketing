import type { Filtros } from '@/lib/datos/filtros'
import { FiltrosComunes } from '@/components/ui/filtros-comunes'

/**
 * Marcas, plataforma y período del tablero: los filtros comunes (ADR-029) con las dos
 * aclaraciones propias de esta pantalla.
 */
export function FiltrosTablero({
  filtros,
  minimo,
  maximo,
}: {
  filtros: Filtros
  /** Borde inferior de la ventana de 90 días (YYYY-MM-DD). */
  minimo: string
  maximo: string
}) {
  return (
    <FiltrosComunes
      accion="/tablero"
      marcaIds={filtros.marcaIds}
      plataforma={filtros.plataforma}
      periodo={{ desde: filtros.desde, hasta: filtros.hasta, minimo, maximo }}
      notas={
        <ul className="space-y-1 text-xs text-(--color-tenue)">
          <li>Publicidad: solo filtra por fechas (campañas sin marca/plataforma).</li>
          <li>Las métricas orgánicas = acumulado de vida por publicación, hasta la última sincronización.</li>
        </ul>
      }
    />
  )
}
