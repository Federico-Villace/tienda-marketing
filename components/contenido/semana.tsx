import { LIMITES } from '@/lib/contenidista/limites'
import { planDesactualizado, type GrupoPieza } from '@/lib/contenidista/pantalla'
import { excedeTope, piezasPedidas, rangoSemana } from '@/lib/contenidista/semana'
import type { TandaVista } from '@/lib/contenidista/tipos'
import { formatearUsd } from '@/lib/estratega/formato'
import type { PlanVista } from '@/lib/estratega/tipos'
import { Generador } from './generador'
import { HistorialTandas } from './historial'
import { Pieza } from './pieza'

/**
 * Una semana del plan: lo que pide, el generador y las piezas de la tanda
 * elegida (la última, o la de ?tanda=). Server component: sin estado.
 */
export function Semana({
  plan: vista,
  semana,
  tanda,
  grupos,
  tandasPrevias,
  puedeEditar,
  habilitado,
  ocultas = 0,
}: {
  plan: PlanVista
  semana: number
  /** La tanda que se muestra, o null si la semana todavía no se generó. */
  tanda: TandaVista | null
  grupos: readonly GrupoPieza[]
  /** Las otras tandas de la semana, de la más nueva a la más vieja. */
  tandasPrevias: readonly TandaVista[]
  puedeEditar: boolean
  habilitado: boolean
  /** Piezas de la tanda que los filtros dejan afuera (0 = no hay filtro o no ocultó nada). */
  ocultas?: number
}) {
  const { plan } = vista
  const fila = plan.calendario.find((s) => s.semana === semana)
  const rango = rangoSemana(plan, semana)
  const pedidas = piezasPedidas(plan, semana)
  const desactualizado = planDesactualizado(vista.estado)

  const motivoBloqueo = excedeTope(plan, semana)
    ? `La semana ${semana} pide ${pedidas} piezas; el tope es ${LIMITES.PIEZAS_POR_SEMANA}. Editá el plan.`
    : desactualizado
      ? 'Este plan ya no es el aprobado: elegí el vigente para generar.'
      : !rango
        ? 'Esta semana queda fuera de la ventana del plan.'
        : null

  // Para el aviso de caché: la última tanda de la semana (la elegida o la más nueva de las otras).
  const ultima = tanda ?? tandasPrevias[0]

  return (
    <section className="space-y-4 border-t border-(--color-borde) pt-6">
      <header>
        <h2 className="text-lg font-semibold">
          Semana {semana}
          {rango && <span className="ml-2 font-mono text-xs font-normal text-(--color-tenue)">{rango.desde} a {rango.hasta}</span>}
        </h2>
        <p className="text-sm text-(--color-tenue)">Eje: {fila?.eje}</p>
        <p className="mt-1 text-xs text-(--color-tenue)">
          {pedidas} {pedidas === 1 ? 'pieza pedida' : 'piezas pedidas'}:{' '}
          {fila?.piezas.map((p) => `${p.cantidad} × ${p.plataforma} ${p.formato} (${p.idea})`).join(' · ')}
        </p>
      </header>

      {puedeEditar && (
        <Generador
          // La key reinicia las notas al cambiar de semana o de plan.
          key={`${vista.id}-${semana}`}
          planId={vista.id}
          semana={semana}
          habilitado={habilitado}
          motivoBloqueo={motivoBloqueo}
          notasPrevias={ultima ? ultima.notas : undefined}
        />
      )}

      {tanda ? (
        <>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-(--color-tenue)">
            <span>{tanda.creadoEn.slice(0, 16).replace('T', ' ')}</span>
            <span>{tanda.notas ? `Notas: ${tanda.notas}` : 'Sin notas'}</span>
            <span>{tanda.modelo}</span>
            {desactualizado && (
              <span className="rounded-full border border-(--color-aviso) px-2 py-0.5 text-(--color-aviso)">plan desactualizado</span>
            )}
            <span className="ml-auto tabular-nums">{formatearUsd(tanda.costoUsd)}</span>
          </p>
          {ocultas > 0 && <p className="text-sm text-(--color-tenue)">Los filtros ocultan {ocultas} {ocultas === 1 ? 'pieza' : 'piezas'}.</p>}
          <div className="space-y-3">
            {grupos.map((g) => (
              <Pieza key={g.raizId} grupo={g} puedeEditar={puedeEditar} marcas={plan.marcas} />
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-(--color-tenue)">Todavía no se generó esta semana.</p>
      )}

      <HistorialTandas planId={vista.id} tandas={tandasPrevias} />
    </section>
  )
}
