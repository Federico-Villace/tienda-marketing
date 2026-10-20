'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AnalisisVista } from '@/lib/analista/historial'
import type { Filtros } from '@/lib/datos/filtros'
import { MARCAS } from '@/lib/datos/marcas'

const MAX_HISTORIAL = 5

const usd = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 4, maximumFractionDigits: 6 })
const fechaHora = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Argentina/Buenos_Aires',
})

/** Siempre con 4 decimales o más: un análisis cuesta centésimas de centavo. */
export const formatearUsd = (n: number): string => `US$ ${usd.format(n)}`

type Resultado = { readonly analisis: AnalisisVista }

export function Analista({
  filtros,
  habilitado,
  historial,
  sinPublicaciones = false,
}: {
  filtros: Filtros
  /** Hay OPENAI_API_KEY en el servidor (el booleano, nunca el valor). */
  habilitado: boolean
  historial: readonly AnalisisVista[]
  sinPublicaciones?: boolean
}) {
  const router = useRouter()
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  // El estado se actualiza después del render: la ref corta un doble click inmediato.
  const enCurso = useRef(false)

  async function analizar() {
    if (enCurso.current) return
    enCurso.current = true
    setCargando(true)
    setError(null)
    setResultado(null)
    try {
      const r = await fetch('/api/analisis', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          marca: filtros.marcaId,
          plataforma: filtros.plataforma,
          desde: filtros.desde,
          hasta: filtros.hasta,
        }),
      })
      const cuerpo = (await r.json().catch(() => ({}))) as { analisis?: AnalisisVista; error?: string }
      if (!r.ok || !cuerpo.analisis) {
        setError(cuerpo.error ?? 'No se pudo completar el análisis. Probá de nuevo.')
        return
      }
      setResultado({ analisis: cuerpo.analisis })
      router.refresh()
    } catch {
      setError('No se pudo completar el análisis. Revisá tu conexión y probá de nuevo.')
    } finally {
      enCurso.current = false
      setCargando(false)
    }
  }

  const ultimos = historial.slice(0, MAX_HISTORIAL)

  return (
    <section className="border-t border-(--color-borde) pt-8">
      <h2 className="mb-2 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
        Agente Analista
      </h2>
      <div className="space-y-4 rounded-lg border border-(--color-borde) px-4 py-4">
        <p className="text-sm text-(--color-tenue)">
          El Analista lee estos mismos agregados —no las filas crudas— y escribe qué funcionó y qué no.
          {!habilitado && (
            <>
              {' '}
              Se habilita cuando esté cargada <code className="font-mono text-xs">OPENAI_API_KEY</code>.
            </>
          )}
        </p>
        {sinPublicaciones && (
          <p className="text-sm text-(--color-tenue)">No hay publicaciones en el período</p>
        )}

        <button
          type="button"
          onClick={analizar}
          disabled={!habilitado || cargando}
          className="rounded-md border border-(--color-borde) px-3 py-1.5 text-sm hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Analizar período
        </button>
        {cargando && (
          <p role="status" className="text-sm text-(--color-tenue)">
            Analizando… puede tardar hasta un minuto.
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">
            {error}
          </p>
        )}

        {resultado && (
          <article className="space-y-2 border-t border-(--color-borde) pt-4">
            <p className="whitespace-pre-wrap text-sm">{resultado.analisis.contenido}</p>
            <p className="flex flex-wrap items-center gap-x-3 text-xs text-(--color-tenue)">
              <span>{resultado.analisis.modelo}</span>
              {resultado.analisis.desdeCache ? (
                <span className="rounded-full border border-(--color-borde) px-2 py-0.5">
                  desde caché · sin costo extra
                </span>
              ) : (
                <span className="tabular-nums">{formatearUsd(resultado.analisis.costoUsd)}</span>
              )}
            </p>
          </article>
        )}
      </div>

      <h3 className="mt-6 mb-2 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
        Últimos análisis
      </h3>
      {ultimos.length === 0 ? (
        <p className="text-sm text-(--color-tenue)">Todavía no hay análisis</p>
      ) : (
        <ul className="space-y-2">
          {ultimos.map((a) => (
            <li key={a.id} className="rounded-lg border border-(--color-borde) px-4 py-2 text-sm">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
                  <span>{fechaHora.format(new Date(a.creadoEn))}</span>
                  <span className="text-xs text-(--color-tenue)">
                    {a.filtros.desde} a {a.filtros.hasta} · {MARCAS.find((m) => m.id === a.filtros.marcaId)?.nombre ?? '—'} ·{' '}
                    {a.filtros.plataforma}
                  </span>
                  <span className="ml-auto text-xs tabular-nums text-(--color-tenue)">{formatearUsd(a.costoUsd)}</span>
                </summary>
                <p className="mt-2 whitespace-pre-wrap">{a.contenido}</p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
