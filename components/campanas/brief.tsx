'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MARCAS } from '@/lib/datos/marcas'
import { SeleccionMultiple } from '@/components/ui/seleccion-multiple'
import type { PlanVista } from '@/lib/estratega/tipos'

export type OpcionAnalisis = {
  readonly id: string
  readonly rotulo: string
  /** Nombres de las marcas del análisis: se preseleccionan en el brief. */
  readonly marcas?: readonly string[]
}

const OPCIONES_MARCAS = MARCAS.map((m) => ({ valor: m.nombre, rotulo: m.nombre }))

const campo =
  'mt-1 block w-full rounded-md border border-(--color-borde) bg-transparent px-2 py-1 text-sm'

/**
 * El brief de la campaña. El plan cuesta ~US$ 0,002 y lo dispara este click
 * (regla dura #3): el costo real se ve en el plan una vez generado.
 */
export function FormularioBrief({
  analisis,
  habilitado,
  desdePorDefecto,
  hastaPorDefecto,
  analisisInicial,
  marcasIniciales,
}: {
  analisis: readonly OpcionAnalisis[]
  /** Hay OPENAI_API_KEY en el servidor (el booleano, nunca el valor). */
  habilitado: boolean
  desdePorDefecto: string
  hastaPorDefecto: string
  /** De ?analisis=: el análisis con el que se abre el brief. */
  analisisInicial?: string
  /** De ?marca=: nombres de marca ya elegidos (no se pisan al cambiar de análisis). */
  marcasIniciales?: readonly string[]
}) {
  const router = useRouter()
  const inicial = analisis.find((a) => a.id === analisisInicial) ?? analisis[0]
  const [analisisId, setAnalisisId] = useState(inicial?.id ?? '')
  const [objetivo, setObjetivo] = useState('')
  const traidas = (marcasIniciales ?? []).filter((m) => OPCIONES_MARCAS.some((o) => o.valor === m))
  const [marcas, setMarcas] = useState<string[]>(traidas.length > 0 ? traidas : [...(inicial?.marcas ?? [])])
  // Si ya las eligió (o vinieron en el link), cambiar de análisis no las pisa.
  const [tocoMarcas, setTocoMarcas] = useState(traidas.length > 0)
  const [producto, setProducto] = useState('')
  const [presupuesto, setPresupuesto] = useState('')
  const [desde, setDesde] = useState(desdePorDefecto)
  const [hasta, setHasta] = useState(hastaPorDefecto)
  const [notas, setNotas] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errores, setErrores] = useState<string[]>([])
  const [desdeCache, setDesdeCache] = useState(false)
  // El estado se actualiza después del render: la ref corta un doble click inmediato.
  const enCurso = useRef(false)

  const listo = habilitado && analisis.length > 0 && objetivo.trim().length > 0 && marcas.length > 0 && !cargando

  function elegirAnalisis(id: string) {
    setAnalisisId(id)
    if (!tocoMarcas) setMarcas([...(analisis.find((a) => a.id === id)?.marcas ?? [])])
  }

  async function generar() {
    if (enCurso.current || !listo) return
    enCurso.current = true
    setCargando(true)
    setError(null)
    setErrores([])
    setDesdeCache(false)
    try {
      const r = await fetch('/api/planes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          analisisId,
          objetivo,
          marcas,
          producto: producto.trim() || null,
          presupuestoTopeArs: presupuesto.trim() === '' ? null : Number(presupuesto),
          desde,
          hasta,
          notas: notas.trim() || null,
        }),
      })
      const cuerpo = (await r.json().catch(() => ({}))) as {
        plan?: PlanVista
        desdeCache?: boolean
        error?: string
        errores?: string[]
      }
      if (!r.ok || !cuerpo.plan) {
        setError(cuerpo.error ?? 'No se pudo generar el plan. Probá de nuevo.')
        setErrores(cuerpo.errores ?? [])
        return
      }
      setDesdeCache(Boolean(cuerpo.desdeCache))
      router.push(`/campanas?plan=${cuerpo.plan.raizId}`)
      router.refresh()
    } catch {
      setError('No se pudo generar el plan. Revisá tu conexión y probá de nuevo.')
    } finally {
      enCurso.current = false
      setCargando(false)
    }
  }

  return (
    <form
      className="space-y-4 rounded-lg border border-(--color-borde) px-4 py-4"
      onSubmit={(e) => {
        e.preventDefault()
        void generar()
      }}
    >
      <p className="text-sm text-(--color-tenue)">
        El Estratega lee el texto del análisis que elijas —no los datos crudos— y tu brief.
        {!habilitado && (
          <>
            {' '}
            Se habilita cuando esté cargada <code className="font-mono text-xs">OPENAI_API_KEY</code>.
          </>
        )}
      </p>

      {analisis.length === 0 ? (
        <p className="text-sm text-(--color-tenue)">
          Primero pedí un análisis en el tablero: el plan se arma a partir de uno guardado.
        </p>
      ) : (
        <label className="block text-sm">
          Análisis base
          <select aria-label="Análisis base" className={campo} value={analisisId} onChange={(e) => elegirAnalisis(e.target.value)}>
            {analisis.map((a) => (
              <option key={a.id} value={a.id}>
                {a.rotulo}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block text-sm">
        Objetivo
        <input aria-label="Objetivo" className={campo} maxLength={300} value={objetivo} onChange={(e) => setObjetivo(e.target.value)} placeholder="Ej.: vender más Zontes en noviembre" />
      </label>

      <SeleccionMultiple
        legend="Marcas"
        opciones={OPCIONES_MARCAS}
        valor={marcas}
        onCambio={(v) => {
          setTocoMarcas(true)
          setMarcas(v)
        }}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Producto (opcional)
          <input aria-label="Producto (opcional)" className={campo} maxLength={100} value={producto} onChange={(e) => setProducto(e.target.value)} />
        </label>
        <label className="block text-sm">
          Presupuesto tope en ARS (opcional)
          <input type="number" min={1} aria-label="Presupuesto tope en ARS (opcional)" className={campo} value={presupuesto} onChange={(e) => setPresupuesto(e.target.value)} />
        </label>
        <label className="block text-sm">
          Desde
          <input type="date" aria-label="Desde" className={campo} value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="block text-sm">
          Hasta
          <input type="date" aria-label="Hasta" className={campo} value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
      </div>

      <label className="block text-sm">
        Notas o correcciones al análisis (opcional)
        <textarea aria-label="Notas o correcciones al análisis (opcional)" className={campo} rows={3} maxLength={1000} value={notas} onChange={(e) => setNotas(e.target.value)} />
      </label>

      <button
        type="submit"
        disabled={!listo}
        className="rounded-md border border-(--color-borde) px-3 py-1.5 text-sm hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Generar plan · ~US$ 0,002
      </button>
      {cargando && (
        <p role="status" className="text-sm text-(--color-tenue)">
          Generando el plan… puede tardar hasta un minuto.
        </p>
      )}
      {desdeCache && (
        <p className="text-xs text-(--color-tenue)">
          <span className="rounded-full border border-(--color-borde) px-2 py-0.5">desde caché · sin costo extra</span>
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
