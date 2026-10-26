import type { ReactNode } from 'react'
import Form from 'next/form'
import { MARCAS } from '@/lib/datos/marcas'
import type { PlataformaFiltro } from '@/lib/datos/filtros'
import { SeleccionMultiple } from './seleccion-multiple'

const OPCIONES_MARCAS = MARCAS.map((m) => ({ valor: m.id, rotulo: m.nombre }))
const OPCIONES_PLATAFORMA = [
  { valor: 'instagram', rotulo: 'Instagram' },
  { valor: 'facebook', rotulo: 'Facebook' },
]

const campoFecha = 'mt-1 block rounded-md border border-(--color-borde) bg-transparent px-2 py-1 text-sm'

export type PeriodoFiltro = {
  desde: string
  hasta: string
  /** Bordes de la ventana de 90 días (YYYY-MM-DD). */
  minimo: string
  maximo: string
}

/**
 * Los filtros de TODAS las pantallas, con las mismas etiquetas y el mismo comportamiento
 * (ADR-029): "Marcas" y "Plataforma" aplican al tocar el chip (auto-envío); las fechas y los
 * campos extra se aplican con "Aplicar". Todo viaja por la URL en un form GET: sin JS
 * también anda, y el link se comparte. `marca` repetido, `marca=todas`, `plataforma`.
 * Instagram + Facebook marcadas equivale a "todas".
 */
export function FiltrosComunes({
  accion,
  marcaIds,
  plataforma,
  periodo,
  ocultos = [],
  children,
  notas,
}: {
  /** A dónde vuelve el formulario (la misma pantalla). */
  accion: string
  marcaIds: readonly string[]
  /** Con valor, muestra el grupo "Plataforma". */
  plataforma?: PlataformaFiltro
  /** Con valor, muestra Desde/Hasta. */
  periodo?: PeriodoFiltro
  /** Parámetros que el formulario debe conservar (ej. el plan elegido). */
  ocultos?: readonly (readonly [string, string])[]
  /** Campos propios de la pantalla (modelo, estado…): se aplican con "Aplicar". */
  children?: ReactNode
  notas?: ReactNode
}) {
  const plataformas = plataforma === undefined || plataforma === 'todas' ? OPCIONES_PLATAFORMA.map((o) => o.valor) : [plataforma]

  return (
    <Form action={accion} replace scroll={false} className="mb-8 space-y-4">
      {ocultos.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SeleccionMultiple legend="Marcas" opciones={OPCIONES_MARCAS} valor={marcaIds} name="marca" autoEnviar />

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        {plataforma !== undefined && (
          <SeleccionMultiple legend="Plataforma" opciones={OPCIONES_PLATAFORMA} valor={plataformas} name="plataforma" todas={false} autoEnviar />
        )}
        {periodo && (
          <>
            <label className="text-xs text-(--color-tenue)">
              Desde
              <input type="date" name="desde" defaultValue={periodo.desde} min={periodo.minimo} max={periodo.maximo} className={campoFecha} />
            </label>
            <label className="text-xs text-(--color-tenue)">
              Hasta
              <input type="date" name="hasta" defaultValue={periodo.hasta} min={periodo.minimo} max={periodo.maximo} className={campoFecha} />
            </label>
          </>
        )}
        {children}
        <button type="submit" className="min-h-11 rounded-md border border-(--color-borde) px-3 py-1.5 text-sm hover:opacity-70">
          Aplicar
        </button>
      </div>

      {notas}
    </Form>
  )
}
