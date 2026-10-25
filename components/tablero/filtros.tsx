import Form from 'next/form'
import type { Filtros } from '@/lib/datos/filtros'
import { MARCAS } from '@/lib/datos/marcas'
import { SeleccionMultiple } from '@/components/ui/seleccion-multiple'

const OPCIONES_MARCAS = MARCAS.map((m) => ({ valor: m.id, rotulo: m.nombre }))
const OPCIONES_CUENTAS = [
  { valor: 'instagram', rotulo: 'Instagram' },
  { valor: 'facebook', rotulo: 'Facebook' },
]

const campoFecha = 'mt-1 block rounded-md border border-(--color-borde) bg-transparent px-2 py-1 text-sm'

/**
 * Marcas, cuentas y período en un solo formulario GET (ADR-028). Todo viaja por la
 * URL: funciona sin JS (con el botón Aplicar) y el link se puede compartir. Con JS,
 * tocar una marca o una cuenta aplica al instante (next/form navega con replace,
 * sin saltar de lugar). Instagram + Facebook marcadas equivale a "todas".
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
  const cuentas = filtros.plataforma === 'todas' ? OPCIONES_CUENTAS.map((o) => o.valor) : [filtros.plataforma]

  return (
    <Form action="/tablero" replace scroll={false} className="mb-8 space-y-4">
      <SeleccionMultiple legend="Marcas" opciones={OPCIONES_MARCAS} valor={filtros.marcaIds} name="marca" autoEnviar />

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <SeleccionMultiple legend="Cuentas" opciones={OPCIONES_CUENTAS} valor={cuentas} name="plataforma" todas={false} autoEnviar />

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-(--color-tenue)">
            Desde
            <input type="date" name="desde" defaultValue={filtros.desde} min={minimo} max={maximo} className={campoFecha} />
          </label>
          <label className="text-xs text-(--color-tenue)">
            Hasta
            <input type="date" name="hasta" defaultValue={filtros.hasta} min={minimo} max={maximo} className={campoFecha} />
          </label>
          <button type="submit" className="min-h-11 rounded-md border border-(--color-borde) px-3 py-1.5 text-sm hover:opacity-70">
            Aplicar
          </button>
        </div>
      </div>

      <ul className="space-y-1 text-xs text-(--color-tenue)">
        <li>Publicidad: solo filtra por fechas (campañas sin marca/plataforma).</li>
        <li>Las métricas orgánicas = acumulado de vida por publicación, hasta la última sincronización.</li>
      </ul>
    </Form>
  )
}
