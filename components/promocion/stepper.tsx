'use client'

import { useState } from 'react'
import Link from 'next/link'

export const NOMBRES_PASOS = ['Qué promocionás', 'Cómo nos fue', 'Texto para publicar', 'Imagen y texto de la placa', 'Aprobar', 'Listo'] as const

/**
 * Los 6 pasos de una promoción. `visible` es el que se está mirando; `pasoActual` es hasta
 * donde llegó la promoción (derivado de lo que ya tiene cargado). Solo se navega a los
 * pasos alcanzados. El estado se dice con texto, no solo con color.
 */
export function Stepper({
  visible,
  alcanzados,
  hrefs,
  pasoActual = visible,
}: {
  visible: number
  alcanzados: readonly number[]
  /** Link de cada paso (índice 0 = paso 1), armado en el servidor: a un componente de cliente no se le pasan funciones. */
  hrefs: readonly string[]
  pasoActual?: number
}) {
  const [verPasos, setVerPasos] = useState(false)
  return (
    <nav aria-label="Pasos de la promoción" className="mb-6">
      <p className="mb-2 font-mono text-xs tracking-widest text-(--color-tenue) uppercase">Paso {visible} de 6</p>
      {/* En el celu: el nombre del paso y una barra de avance; los 6 botones quedan para pantallas más anchas. */}
      <div className="mb-2 space-y-2 sm:hidden">
        <p className="text-base font-semibold">{NOMBRES_PASOS[visible - 1]}</p>
        <button type="button" aria-expanded={verPasos} onClick={() => setVerPasos((v) => !v)} className="inline-flex min-h-11 items-center text-sm underline underline-offset-2">
          {verPasos ? 'Ocultar los pasos' : 'Ver los pasos'}
        </button>
        <div role="progressbar" aria-label="Avance de la promoción" aria-valuemin={1} aria-valuemax={6} aria-valuenow={visible} className="h-1.5 w-full overflow-hidden rounded-full bg-(--color-borde)">
          <div className="h-full bg-(--color-ok)" style={{ width: `${(visible / 6) * 100}%` }} />
        </div>
      </div>
      <ol className={`${verPasos ? 'flex' : 'hidden'} flex-wrap gap-x-1 gap-y-2 sm:flex`}>
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
                <Link href={hrefs[n - 1]!} className={`${base} border-(--color-borde) hover:opacity-70`}>
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
