import Link from 'next/link'

export const NOMBRES_PASOS = ['Qué promocionás', 'Cómo nos fue', 'Textos', 'Imagen', 'Aprobar', 'Listo'] as const

/**
 * Los 6 pasos de una promoción. `visible` es el que se está mirando; `pasoActual` es hasta
 * donde llegó la promoción (derivado de lo que ya tiene cargado). Solo se navega a los
 * pasos alcanzados. El estado se dice con texto, no solo con color.
 */
export function Stepper({
  visible,
  alcanzados,
  hrefDe,
  pasoActual = visible,
}: {
  visible: number
  alcanzados: readonly number[]
  hrefDe: (paso: number) => string
  pasoActual?: number
}) {
  return (
    <nav aria-label="Pasos de la promoción" className="mb-6">
      <p className="mb-2 font-mono text-xs tracking-widest text-(--color-tenue) uppercase">Paso {visible} de 6</p>
      <ol className="flex flex-wrap gap-x-1 gap-y-2">
        {NOMBRES_PASOS.map((nombre, i) => {
          const n = i + 1
          const estado = n === visible ? 'actual' : n < pasoActual ? 'hecho' : n === pasoActual ? 'siguiente' : 'pendiente'
          const etiqueta = (
            <>
              <span className="font-mono text-xs tabular-nums">{n}</span> {nombre}
              <span className="sr-only"> ({estado === 'actual' ? 'paso que estás viendo' : estado === 'siguiente' ? 'te toca' : estado})</span>
            </>
          )
          const base = 'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm'
          return (
            <li key={n}>
              {n === visible ? (
                <span aria-current="step" className={`${base} border-(--color-ok) font-semibold`}>
                  {etiqueta}
                </span>
              ) : alcanzados.includes(n) ? (
                <Link href={hrefDe(n)} className={`${base} border-(--color-borde) hover:opacity-70`}>
                  {etiqueta}
                </Link>
              ) : (
                <span className={`${base} border-transparent text-(--color-tenue)`}>{etiqueta}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
