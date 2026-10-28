import type { PostFila } from '@/lib/analista/origen'

const entero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })
const porciento = new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 1 })
const fecha = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', timeZone: 'America/Argentina/Buenos_Aires' })

const RED = { instagram: 'Instagram', facebook: 'Facebook' } as const

/** Una publicación con, si hay ranking, cuántas veces lo habitual de su cuenta rindió. */
export type FilaTabla = PostFila & { readonly indice?: number }

const th = 'px-3 py-2 font-medium'

/** La tabla de publicaciones del tablero: cada fila lleva el link al post en la red. */
export function TablaPublicaciones({
  titulo,
  filas,
  conMarca = false,
}: {
  titulo: string
  filas: readonly FilaTabla[]
  /** Con varias marcas elegidas: un chip con la marca de cada publicación. */
  conMarca?: boolean
}) {
  const conIndice = filas.some((f) => f.indice !== undefined)
  return (
    <div className="overflow-x-auto rounded-lg border border-(--color-borde)">
      <table aria-label={titulo} className="w-full min-w-[44rem] text-sm">
        <thead>
          <tr className="border-b border-(--color-borde) text-left text-xs text-(--color-tenue)">
            <th className={th}>Fecha</th>
            <th className={th}>Plataforma</th>
            <th className={th}>Formato</th>
            <th className={th}>Publicación</th>
            {conIndice && <th className={`${th} text-right`}>× lo habitual</th>}
            <th className={`${th} text-right`}>Vistas</th>
            <th className={`${th} text-right`}>% interacción</th>
            <th className={th}>Link</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const red = RED[f.plataforma]
            return (
              <tr key={f.id} className="border-t border-(--color-borde)">
                <td className="px-3 py-2.5 text-xs whitespace-nowrap text-(--color-tenue) tabular-nums">{fecha.format(new Date(f.publicadoEn))}</td>
                <td className="px-3 py-2.5 text-xs text-(--color-tenue)">{red}</td>
                <td className="px-3 py-2.5 text-xs text-(--color-tenue) capitalize">{f.tipo}</td>
                <td className="max-w-[16rem] truncate px-3 py-2.5">
                  {conMarca && f.marca && (
                    <span className="mr-2 rounded-full border border-(--color-borde) px-2 py-0.5 text-xs text-(--color-tenue)">{f.marca}</span>
                  )}
                  {f.texto || <span className="text-(--color-tenue)">Sin texto</span>}
                </td>
                {conIndice && <td className="px-3 py-2.5 text-right font-medium tabular-nums">{f.indice === undefined ? '—' : `${decimal.format(f.indice)}×`}</td>}
                <td className="px-3 py-2.5 text-right tabular-nums">{entero.format(f.vistas)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{f.vistas > 0 ? porciento.format(f.interacciones / f.vistas) : '—'}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {f.permalink ? (
                    <a
                      href={f.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-6 items-center underline underline-offset-2 hover:opacity-70"
                      aria-label={`Ver en ${red} (abre en una nueva pestaña)`}
                    >
                      Ver en {red}
                    </a>
                  ) : (
                    <span className="text-(--color-tenue)">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
