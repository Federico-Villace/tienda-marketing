import type { FormatoRendimiento } from '@/lib/datos/destacados'

const entero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })

/** Vistas promedio por formato en barras CSS. Solo orgánico: los anuncios no informan formato. */
export function Formatos({ filas }: { filas: readonly FormatoRendimiento[] }) {
  if (filas.length === 0) return null
  return (
    <section aria-labelledby="formatos-titulo">
      <h2 id="formatos-titulo" className="mb-2 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
        Por formato (orgánico)
      </h2>
      <ul className="space-y-2 rounded-lg border border-(--color-borde) px-4 py-3">
        {filas.map((f) => (
          <li key={f.tipo} className={f.muestraChica ? 'opacity-60' : ''}>
            <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
              <span className="w-20 capitalize">{f.tipo}</span>
              <span className="tabular-nums">{entero.format(f.vistasPromedio)} vistas por publicación</span>
              <span className="tabular-nums text-(--color-tenue)">
                {decimal.format(f.tasaPct)}% de interacción · {f.publicaciones} {f.publicaciones === 1 ? 'publicación' : 'publicaciones'}
                {f.muestraChica ? ' · muestra chica' : ''}
              </span>
            </div>
            <div aria-hidden="true" className="mt-1 h-1.5 rounded-full bg-(--color-borde)">
              <div className="h-1.5 rounded-full" style={{ width: `${f.anchoPct}%`, backgroundColor: 'currentColor', opacity: 0.5 }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-(--color-tenue)">Los anuncios no informan formato.</p>
    </section>
  )
}
