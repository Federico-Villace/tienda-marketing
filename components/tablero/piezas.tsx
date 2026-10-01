import type { FilaAgrupada, ResumenPeriodo } from '@/lib/datos/agregados'
import type { Publicacion } from '@/lib/datos/tipos'
import { interaccionesDe } from '@/lib/datos/tipos'

const numero = new Intl.NumberFormat('es-AR')
const porciento = new Intl.NumberFormat('es-AR', {
  style: 'percent',
  maximumFractionDigits: 2,
})
const moneda = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})
const fecha = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short' })

export const fmt = { numero, porciento, moneda, fecha }

export function Tarjeta({
  rotulo,
  valor,
  detalle,
}: {
  rotulo: string
  valor: string
  detalle?: string
}) {
  return (
    <div className="rounded-lg border border-(--color-borde) px-4 py-3">
      <p className="text-xs tracking-wide text-(--color-tenue) uppercase">
        {rotulo}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
      {detalle && (
        <p className="mt-0.5 text-xs text-(--color-tenue)">{detalle}</p>
      )}
    </div>
  )
}

export function Resumen({ resumen }: { resumen: ResumenPeriodo }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tarjeta rotulo="Publicaciones" valor={numero.format(resumen.publicaciones)} />
      <Tarjeta rotulo="Vistas" valor={numero.format(resumen.vistas)} />
      <Tarjeta
        rotulo="Interacciones"
        valor={numero.format(resumen.interacciones)}
      />
      <Tarjeta
        rotulo="Tasa de interacción"
        valor={porciento.format(resumen.tasaInteraccion)}
        detalle={`${numero.format(Math.round(resumen.vistasPromedio))} vistas promedio`}
      />
    </div>
  )
}

/** Barra comparativa: el mejor del grupo marca el 100%. */
export function TablaAgrupada({
  titulo,
  filas,
  rotuloClave,
}: {
  titulo: string
  filas: readonly FilaAgrupada[]
  rotuloClave: string
}) {
  const techo = Math.max(...filas.map((f) => f.vistasPromedio), 1)

  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
        {titulo}
      </h2>
      <div className="overflow-x-auto rounded-lg border border-(--color-borde)">
        <table className="w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="border-b border-(--color-borde) text-left text-xs text-(--color-tenue)">
              <th className="px-4 py-2 font-medium">{rotuloClave}</th>
              <th className="px-4 py-2 text-right font-medium">Posts</th>
              <th className="px-4 py-2 text-right font-medium">Vistas prom.</th>
              <th className="px-4 py-2 text-right font-medium">Interacción</th>
              <th className="w-28 px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.clave} className="border-t border-(--color-borde)">
                <td className="px-4 py-2 capitalize">{f.clave}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {f.publicaciones}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {numero.format(Math.round(f.vistasPromedio))}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {porciento.format(f.tasaInteraccion)}
                </td>
                <td className="px-4 py-2">
                  <div
                    className="h-1.5 rounded-full bg-(--color-tinte)"
                    style={{
                      width: `${Math.round((f.vistasPromedio / techo) * 100)}%`,
                      backgroundColor: 'currentColor',
                      opacity: 0.35,
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function ListaPublicaciones({
  titulo,
  publicaciones,
}: {
  titulo: string
  publicaciones: readonly Publicacion[]
}) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
        {titulo}
      </h2>
      <ul className="rounded-lg border border-(--color-borde) px-4">
        {publicaciones.map((p) => (
          <li
            key={p.id}
            className="flex items-baseline gap-3 border-t border-(--color-borde) py-2.5 first:border-t-0"
          >
            <span className="w-12 shrink-0 text-xs text-(--color-tenue) tabular-nums">
              {fecha.format(p.publicadoEn)}
            </span>
            <span className="w-16 shrink-0 text-xs text-(--color-tenue) capitalize">
              {p.tipo}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">{p.texto}</span>
            <span className="shrink-0 text-sm tabular-nums">
              {numero.format(p.vistas)}
            </span>
            <span className="w-16 shrink-0 text-right text-xs text-(--color-tenue) tabular-nums">
              {numero.format(interaccionesDe(p))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
