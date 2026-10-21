'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LIMITES } from '@/lib/contenidista/limites'
import { formatearUsd } from '@/lib/estratega/formato'
import { postTanda } from './api'

const campo = 'mt-1 block w-full rounded-md border border-(--color-borde) bg-transparent px-2 py-1 text-sm'

const normalizar = (t: string): string | null => (t.trim() === '' ? null : t.trim())

/**
 * Genera las piezas de UNA semana. Cuesta ~US$0,002 y lo dispara este click
 * (regla dura #3). No hay botón "regenerar": otras notas = otra tanda; las mismas
 * notas salen de la caché sin costo.
 */
export function Generador({
  planId,
  semana,
  habilitado,
  motivoBloqueo,
  notasPrevias,
}: {
  planId: string
  semana: number
  /** Hay OPENAI_API_KEY en el servidor (el booleano, nunca el valor). */
  habilitado: boolean
  /** Por qué no se puede generar (p. ej. más de 12 piezas), o null. */
  motivoBloqueo: string | null
  /** Notas de la última tanda de la semana; undefined si todavía no hay ninguna. */
  notasPrevias: string | null | undefined
}) {
  const router = useRouter()
  const [notas, setNotas] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errores, setErrores] = useState<string[]>([])
  const [resultado, setResultado] = useState<{ costoUsd: number; desdeCache: boolean } | null>(null)
  // El estado se actualiza después del render: la ref corta un doble click inmediato.
  const enCurso = useRef(false)

  const bloqueado = !habilitado || motivoBloqueo !== null
  const sale_de_cache = notasPrevias !== undefined && normalizar(notas) === notasPrevias
  const etiqueta = sale_de_cache
    ? `Ver semana ${semana} · desde caché · US$0`
    : `Generar semana ${semana} · ~US$0,002 (tope US$0,004)`

  async function generar() {
    if (enCurso.current || bloqueado) return
    enCurso.current = true
    setCargando(true)
    setError(null)
    setErrores([])
    setResultado(null)
    const r = await postTanda({ plan_id: planId, semana, notas: normalizar(notas) })
    enCurso.current = false
    setCargando(false)
    if (!r.ok) {
      setError(r.error)
      setErrores(r.errores)
      return
    }
    setResultado({ costoUsd: r.tanda.costoUsd, desdeCache: r.desdeCache })
    router.push(`/contenido?plan=${planId}&tanda=${r.tanda.id}`)
    router.refresh()
  }

  return (
    <form
      className="space-y-3 rounded-lg border border-(--color-borde) px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        void generar()
      }}
    >
      <label className="block text-sm">
        Notas para la semana {semana} (opcional)
        <textarea
          aria-label={`Notas para la semana ${semana} (opcional)`}
          className={campo}
          rows={2}
          maxLength={LIMITES.NOTAS}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
        />
        <span className="text-xs text-(--color-tenue)">{notas.length}/{LIMITES.NOTAS}</span>
      </label>

      <button
        type="submit"
        disabled={bloqueado || cargando}
        className="rounded-md border border-(--color-borde) px-3 py-1.5 text-sm hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {etiqueta}
      </button>

      {!habilitado && (
        <p className="text-xs text-(--color-tenue)">
          Se habilita cuando esté cargada <code className="font-mono">OPENAI_API_KEY</code>.
        </p>
      )}
      {motivoBloqueo && <p className="text-xs text-(--color-tenue)">{motivoBloqueo}</p>}
      {cargando && (
        <p role="status" className="text-sm text-(--color-tenue)">
          Escribiendo las piezas… puede tardar hasta un minuto.
        </p>
      )}
      {resultado && (
        <p className="text-xs text-(--color-tenue)">
          {resultado.desdeCache ? 'Desde caché: US$ 0' : `Costo real: ${formatearUsd(resultado.costoUsd)}`}
        </p>
      )}
      {error && (
        <div role="alert" className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">
          <p>{error}</p>
          {errores.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {errores.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  )
}
