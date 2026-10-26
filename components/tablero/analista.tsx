'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MAX_ANALISIS } from '@/lib/analista/limites'
import type { AnalisisVista } from '@/lib/analista/historial'
import type { Filtros } from '@/lib/datos/filtros'
import { rotuloMarcas } from '@/lib/datos/marcas'
import { hrefPlanDesdeAnalisis } from '@/lib/estratega/pantalla'

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

const MENSAJE_409 = 'Se recargó la pantalla porque otra persona cambió este análisis.'
const boton =
  'rounded-md border border-(--color-borde) px-3 py-1.5 text-sm hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50'

export function Analista({
  filtros,
  habilitado,
  historial,
  sinPublicaciones = false,
  puedeEditar = false,
  costo = '',
}: {
  filtros: Filtros
  /** Hay OPENAI_API_KEY en el servidor (el booleano, nunca el valor). */
  habilitado: boolean
  historial: readonly AnalisisVista[]
  sinPublicaciones?: boolean
  /** Decide si se ve "Analizar período" y "Editar": el endpoint es la autoridad (un lector recibe 403), pero no se le ofrece un botón que falla. */
  puedeEditar?: boolean
  /** "~US$ 0,002", calculado en el servidor (vacío si el modelo no tiene precio). */
  costo?: string
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
          marcas: filtros.marcaIds,
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
        {filtros.marcaIds.length > 1 && (
          <p className="text-sm text-(--color-tenue)">
            Con varias marcas, el Analista compara entre las marcas y después las suma.
          </p>
        )}
        {sinPublicaciones && (
          <p className="text-sm text-(--color-tenue)">No hay publicaciones en el período</p>
        )}

        {puedeEditar && (
          <button type="button" onClick={analizar} disabled={!habilitado || cargando} className={boton}>
            Analizar período{costo && ` · ${costo}`}
          </button>
        )}
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
                  desde caché · US$ 0
                </span>
              ) : (
                <span className="tabular-nums">{formatearUsd(resultado.analisis.costoUsd)}</span>
              )}
            </p>
            <LinkPlan a={resultado.analisis} />
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
            <AnalisisAnterior key={a.id} a={a} puedeEditar={puedeEditar} />
          ))}
        </ul>
      )}
    </section>
  )
}

/** Del análisis al plan: /campanas lo recibe ya elegido y con sus marcas preseleccionadas. */
function LinkPlan({ a }: { a: AnalisisVista }) {
  return (
    <a
      href={hrefPlanDesdeAnalisis(a.id, a.filtros.marcaIds)}
      className="inline-flex min-h-11 items-center text-sm underline underline-offset-2 hover:opacity-70"
    >
      Armar un plan con este análisis →
    </a>
  )
}

/**
 * Un análisis del historial: el texto vigente (la última edición) con OK de
 * versiones y, si el rol lo permite, Editar. Editar crea una versión nueva sin
 * costo; el original del modelo queda siempre a la vista.
 */
function AnalisisAnterior({ a, puedeEditar }: { a: AnalisisVista; puedeEditar: boolean }) {
  const [editando, setEditando] = useState(false)
  const editado = a.version > 1

  return (
    <li className="rounded-lg border border-(--color-borde) px-4 py-2 text-sm">
      <details>
        <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
          <span>{fechaHora.format(new Date(a.creadoEn))}</span>
          <span className="text-xs text-(--color-tenue)">
            {a.filtros.desde} a {a.filtros.hasta} · {rotuloMarcas(a.filtros.marcaIds)} ·{' '}
            {a.filtros.plataforma}
          </span>
          {editado && (
            <span className="rounded-full border border-(--color-borde) px-2 py-0.5 text-xs text-(--color-tenue)">
              v{a.version} · editado {a.editadoEn ? fechaHora.format(new Date(a.editadoEn)) : ''}
            </span>
          )}
          <span className="ml-auto text-xs tabular-nums text-(--color-tenue)">{formatearUsd(a.costoUsd)}</span>
        </summary>
        <p className="mt-2 whitespace-pre-wrap">{a.contenido}</p>
        <div className="mt-2">
          <LinkPlan a={a} />
        </div>

        {puedeEditar && !editando && (
          <button type="button" className={`${boton} mt-3`} onClick={() => setEditando(true)}>
            Editar
          </button>
        )}
        {editando && <Editor a={a} onCerrar={() => setEditando(false)} />}

        {editado && (
          <div className="mt-3 space-y-2 border-t border-(--color-borde) pt-3">
            <p className="text-xs tracking-wide text-(--color-tenue) uppercase">Original del modelo</p>
            <p className="text-xs whitespace-pre-wrap text-(--color-tenue)">{a.original}</p>
            <ul aria-label="Versiones" className="space-y-1">
              {a.versiones.map((v) => (
                <li key={v.version} className="flex flex-wrap gap-x-4 text-xs text-(--color-tenue)">
                  <span className="font-mono">v{v.version}</span>
                  <span>{v.autor === null ? 'Modelo' : 'Edición'}</span>
                  <span className="ml-auto tabular-nums">{fechaHora.format(new Date(v.fecha))}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </details>
    </li>
  )
}

/** Edición inline sobre estado local. Guardar manda PATCH con la versión que se veía. */
function Editor({ a, onCerrar }: { a: AnalisisVista; onCerrar: () => void }) {
  const router = useRouter()
  const [texto, setTexto] = useState(a.contenido)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const enCurso = useRef(false)

  const vacio = texto.trim() === ''
  const largo = texto.length > MAX_ANALISIS

  async function guardar() {
    if (enCurso.current || vacio || largo) return
    enCurso.current = true
    setCargando(true)
    setError(null)
    try {
      const r = await fetch(`/api/analisis/${a.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contenido: texto, version: a.version }),
      })
      if (r.ok) {
        router.refresh()
        onCerrar()
        return
      }
      const cuerpo = (await r.json().catch(() => ({}))) as { error?: string }
      setError(r.status === 409 ? MENSAJE_409 : (cuerpo.error ?? 'No se pudo guardar la edición. Probá de nuevo.'))
      if (r.status === 409) router.refresh()
    } catch {
      setError('No se pudo guardar la edición. Revisá tu conexión y probá de nuevo.')
    } finally {
      enCurso.current = false
      setCargando(false)
    }
  }

  return (
    <form
      className="mt-3 space-y-3 rounded-lg border border-(--color-borde) px-4 py-4"
      onSubmit={(e) => {
        e.preventDefault()
        void guardar()
      }}
    >
      <p className="text-sm text-(--color-tenue)">
        Editar crea la versión {a.version + 1}, sin costo. El original del modelo queda en el historial.
      </p>
      <label className="block text-sm">
        Texto del análisis
        <textarea
          aria-label="Texto del análisis"
          className="mt-1 block w-full rounded-md border border-(--color-borde) bg-transparent px-2 py-1 text-sm"
          rows={10}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
      </label>
      <span className={`text-xs tabular-nums ${largo ? 'font-semibold text-(--color-falta)' : 'text-(--color-tenue)'}`}>
        {texto.length}/{MAX_ANALISIS}
      </span>
      {error && (
        <p role="alert" className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={boton} disabled={cargando || vacio || largo}>
          Guardar como versión {a.version + 1}
        </button>
        <button type="button" className={boton} onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
