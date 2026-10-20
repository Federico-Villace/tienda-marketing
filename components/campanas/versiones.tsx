import Link from 'next/link'
import { formatearUsd } from '@/lib/estratega/formato'
import type { GrupoPlan } from '@/lib/estratega/historial'
import { ROTULO_ESTADO } from './plan'

const titulo = 'mt-8 mb-2 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase'

/** Historial de la raíz elegida y, abajo, los otros planes. Todo por links (GET). */
export function Versiones({
  grupos,
  raizActual,
  versionActual,
}: {
  grupos: readonly GrupoPlan[]
  raizActual: string
  versionActual: number
}) {
  const actual = grupos.find((g) => g.raizId === raizActual)
  const otros = grupos.filter((g) => g.raizId !== raizActual)
  return (
    <>
      {actual && (
        <>
          <h2 className={titulo}>Versiones</h2>
          <ul aria-label="Versiones" className="space-y-2">
            {actual.versiones.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-(--color-borde) px-4 py-2 text-sm">
                <Link
                  href={`/campanas?plan=${raizActual}&v=${v.version}`}
                  aria-current={v.version === versionActual ? 'true' : undefined}
                  className={v.version === versionActual ? 'font-mono font-semibold underline' : 'font-mono hover:opacity-70'}
                >
                  v{v.version}
                </Link>
                <span className="text-xs text-(--color-tenue)">{v.origen === 'agente' ? 'Agente' : 'Edición'}</span>
                <span className="text-xs">{ROTULO_ESTADO[v.estado]}</span>
                <span className="ml-auto text-xs tabular-nums text-(--color-tenue)">{formatearUsd(v.costoUsd)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {otros.length > 0 && (
        <>
          <h2 className={titulo}>Otros planes</h2>
          <ul aria-label="Otros planes" className="space-y-2">
            {otros.map((g) => (
              <li key={g.raizId} className="rounded-lg border border-(--color-borde) px-4 py-2 text-sm">
                <Link href={`/campanas?plan=${g.raizId}`} className="hover:opacity-70">
                  {g.punta.brief.objetivo}
                </Link>
                <span className="ml-3 text-xs text-(--color-tenue)">
                  {g.versiones.length} {g.versiones.length === 1 ? 'versión' : 'versiones'} · {ROTULO_ESTADO[g.vigente?.estado ?? g.punta.estado]}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
