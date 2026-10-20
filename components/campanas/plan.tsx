import { formatearArs, formatearUsd } from '@/lib/estratega/formato'
import type { EstadoPlan, PlanVista } from '@/lib/estratega/tipos'

export const ROTULO_ESTADO: Record<EstadoPlan, string> = {
  borrador: 'Borrador',
  aprobado: 'Aprobado',
  descartado: 'Descartado',
  reemplazado: 'Reemplazado',
}

const NIVELES = { campania: 'a nivel campaña', conjunto: 'a nivel conjunto de anuncios', a_definir: 'a definir' } as const

const titulo = 'mb-2 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase'
const tarjeta = 'rounded-lg border border-(--color-borde) px-4 py-3'
const rotulo = 'text-xs tracking-wide text-(--color-tenue) uppercase'

/** Lo que Julián tiene que tener claro antes de aprobar. */
export function NotaMeta() {
  return (
    <p role="note" className="mb-6 rounded-lg border border-(--color-borde) px-4 py-3 text-sm text-(--color-tenue)">
      Esto es una propuesta: no se ejecuta nada en Meta. Los públicos son recomendaciones en texto, no audiencias
      cargadas, y el presupuesto es una sugerencia en pesos que se carga a mano.
    </p>
  )
}

/** Un plan completo, solo lectura. Server component: sin estado. */
export function PlanCampania({ vista }: { vista: PlanVista }) {
  const { plan } = vista
  const p = plan.presupuesto
  return (
    <article className="space-y-8">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-(--color-tenue)">
        <span className="font-mono">v{vista.version}</span>
        <span>{vista.origen === 'agente' ? 'Generado por el Estratega' : 'Editado por una persona'}</span>
        <span className="rounded-full border border-(--color-borde) px-2 py-0.5">{ROTULO_ESTADO[vista.estado]}</span>
        <span className="ml-auto tabular-nums">{formatearUsd(vista.costoUsd)}</span>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className={tarjeta}>
          <p className={rotulo}>Objetivo</p>
          <p className="mt-1 text-sm">{plan.objetivo}</p>
        </div>
        <div className={tarjeta}>
          <p className={rotulo}>Mensaje central</p>
          <p className="mt-1 text-sm">{plan.mensajeCentral}</p>
        </div>
        <div className={tarjeta}>
          <p className={rotulo}>Público</p>
          <p className="mt-1 text-sm">{plan.publico.descripcion}</p>
          {plan.publico.segmentos.length > 0 && (
            <ul className="mt-2 space-y-1.5 text-xs text-(--color-tenue)">
              {plan.publico.segmentos.map((s, i) => (
                <li key={i}>
                  <span className="font-medium text-current">{s.nombre}</span>
                  <span> · {s.criterio}</span>
                  <span> · {s.porque}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={tarjeta}>
          <p className={rotulo}>Presupuesto · Propuesta</p>
          <p className="mt-1 text-sm">
            {p.montoArs === null ? <span>A definir</span> : <span>{formatearArs(p.montoArs)}</span>}
          </p>
          <p className="text-xs text-(--color-tenue)">{NIVELES[p.nivel]}</p>
          {p.nota && <p className="mt-1 text-xs text-(--color-tenue)">{p.nota}</p>}
        </div>
      </section>

      <section>
        <h2 className={titulo}>Reparto por canal</h2>
        <div className="overflow-x-auto rounded-lg border border-(--color-borde)">
          <table className="w-full min-w-[34rem] text-sm">
            <tbody>
              {plan.canales.map((c) => (
                <tr key={c.plataforma} className="border-t border-(--color-borde) first:border-t-0">
                  <td className="px-4 py-2.5 font-medium capitalize">{c.plataforma}</td>
                  <td className="px-4 py-2.5 text-(--color-tenue)">{c.formatos.join(', ')}</td>
                  <td className="px-4 py-2.5 tabular-nums">{c.porcentaje}%</td>
                  <td className="px-4 py-2.5 text-xs text-(--color-tenue)">{c.porque}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className={titulo}>Calendario · {plan.ventana.desde} a {plan.ventana.hasta}</h2>
        <ol className="space-y-2">
          {plan.calendario.map((s) => (
            <li key={s.semana} className="rounded-lg border border-(--color-borde) px-4 py-2.5">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="w-20 shrink-0 font-mono text-xs text-(--color-tenue)">Semana {s.semana}</span>
                <span className="flex-1 text-sm font-medium">{s.eje}</span>
              </div>
              <ul className="mt-1 space-y-0.5 text-xs text-(--color-tenue)">
                {s.piezas.map((z, i) => (
                  <li key={i}>
                    {z.cantidad} × {z.formato} en {z.plataforma}: {z.idea}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      {plan.kpis.length > 0 && (
        <section>
          <h2 className={titulo}>KPIs</h2>
          <ul className="space-y-1 text-sm">
            {plan.kpis.map((k, i) => (
              <li key={i} className="flex gap-3">
                <span className="font-medium">{k.metrica}</span>
                <span className="text-(--color-tenue)">{k.meta}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className={titulo}>Fundamentos</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {plan.fundamentos.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
        {plan.supuestos.length > 0 && (
          <>
            <h3 className={`${titulo} mt-4`}>Supuestos</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-(--color-tenue)">
              {plan.supuestos.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </>
        )}
      </section>
    </article>
  )
}
