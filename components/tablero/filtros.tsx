import Link from 'next/link'
import { hrefTablero, type Filtros, type PlataformaFiltro } from '@/lib/datos/filtros'
import { MARCAS } from '@/lib/datos/marcas'

const PLATAFORMAS: readonly { valor: PlataformaFiltro; rotulo: string }[] = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'instagram', rotulo: 'Instagram' },
  { valor: 'facebook', rotulo: 'Facebook' },
]

const chip = (activo: boolean) =>
  `rounded-full border px-3 py-1 text-sm transition-opacity ${
    activo ? 'border-current font-medium' : 'border-(--color-borde) text-(--color-tenue) hover:opacity-70'
  }`

const campoFecha = 'mt-1 block rounded-md border border-(--color-borde) bg-transparent px-2 py-1 text-sm'

/**
 * Marca, plataforma y período. Todo viaja por la URL (GET): funciona sin JS y el
 * link se puede compartir. Los toggles y las marcas son links que conservan el
 * resto de los filtros; las fechas, un formulario nativo.
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
    <div className="mb-8 space-y-4">
      <nav aria-label="Marca" className="flex flex-wrap gap-2">
        {MARCAS.map((m) => (
          <Link
            key={m.id}
            href={hrefTablero(filtros, { marcaId: m.id })}
            aria-current={m.id === filtros.marcaId ? 'true' : undefined}
            className={chip(m.id === filtros.marcaId)}
          >
            {m.nombre}
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <nav aria-label="Plataforma" className="flex gap-2">
          {PLATAFORMAS.map((p) => (
            <Link
              key={p.valor}
              href={hrefTablero(filtros, { plataforma: p.valor })}
              aria-current={p.valor === filtros.plataforma ? 'true' : undefined}
              className={chip(p.valor === filtros.plataforma)}
            >
              {p.rotulo}
            </Link>
          ))}
        </nav>

        <form method="get" action="/tablero" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="marca" value={filtros.marcaId} />
          <input type="hidden" name="plataforma" value={filtros.plataforma} />
          <label className="text-xs text-(--color-tenue)">
            Desde
            <input
              type="date"
              name="desde"
              defaultValue={filtros.desde}
              min={minimo}
              max={maximo}
              className={campoFecha}
            />
          </label>
          <label className="text-xs text-(--color-tenue)">
            Hasta
            <input
              type="date"
              name="hasta"
              defaultValue={filtros.hasta}
              min={minimo}
              max={maximo}
              className={campoFecha}
            />
          </label>
          <button
            type="submit"
            className="rounded-md border border-(--color-borde) px-3 py-1.5 text-sm hover:opacity-70"
          >
            Aplicar
          </button>
        </form>
      </div>

      <ul className="space-y-1 text-xs text-(--color-tenue)">
        <li>Publicidad: solo filtra por fechas (campañas sin marca/plataforma).</li>
        <li>Las métricas orgánicas = acumulado de vida por publicación, hasta la última sincronización.</li>
      </ul>
    </div>
  )
}
