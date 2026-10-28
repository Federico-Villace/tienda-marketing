'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LIMITES_V4, type AnalisisV4, type AnalisisV4Vista, type IdeaV4, type ItemV4 } from '@/lib/analista/estructurado'

const MENSAJE_409 = 'Se recargó la pantalla porque otra persona cambió este análisis.'
const boton =
  'rounded-md border border-(--color-borde) px-3 py-1.5 text-sm hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50'
const campo = 'mt-1 block w-full rounded-md border border-(--color-borde) bg-transparent px-2 py-1 text-sm'

/** De la vista (con datos, confianza y verificado) a lo que se guarda: solo la forma del modelo. */
export function aEditable(v: AnalisisV4Vista): AnalisisV4 {
  const item = (x: ItemV4): ItemV4 => ({ accion: x.accion, porque: x.porque, hechos: [...x.hechos] })
  const idea = (x: IdeaV4): IdeaV4 => ({
    titulo: x.titulo, marca: x.marca, modelo: x.modelo, formato: x.formato, tipoPromo: x.tipoPromo,
    momento: x.momento, porque: x.porque, hechos: [...x.hechos],
  })
  return { resumen: v.resumen, hace: v.hace.map(item), evita: v.evita.map(item), proba: v.proba.map(item), ideas: v.ideas.map(idea) }
}

type ListaItems = 'hace' | 'evita' | 'proba'
const TITULOS: Record<ListaItems, string> = { hace: 'Hacé', evita: 'Evitá', proba: 'Probá' }

/**
 * Edición por campos de un análisis v4. Se puede corregir el texto y quitar ítems; no se
 * pueden agregar datos de origen nuevos (el servidor lo valida contra la entrada guardada).
 * Guardar crea la versión siguiente, sin costo.
 */
export function EditorEstructurado({ id, version, inicial, onCerrar }: { id: string; version: number; inicial: AnalisisV4Vista; onCerrar: () => void }) {
  const router = useRouter()
  const [a, setA] = useState<AnalisisV4>(() => aEditable(inicial))
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const enCurso = useRef(false)

  const sinItems = a.hace.length + a.evita.length + a.proba.length === 0
  const resumenVacio = a.resumen.trim() === ''

  const cambiarItem = (l: ListaItems, i: number, c: Partial<ItemV4>) => setA({ ...a, [l]: a[l].map((x, j) => (j === i ? { ...x, ...c } : x)) })
  const quitarItem = (l: ListaItems, i: number) => setA({ ...a, [l]: a[l].filter((_, j) => j !== i) })
  const cambiarIdea = (i: number, c: Partial<IdeaV4>) => setA({ ...a, ideas: a.ideas.map((x, j) => (j === i ? { ...x, ...c } : x)) })

  async function guardar() {
    if (enCurso.current || sinItems || resumenVacio) return
    enCurso.current = true
    setCargando(true)
    setError(null)
    try {
      const r = await fetch(`/api/analisis/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ estructurado: a, version }),
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
      className="mt-3 space-y-4 rounded-lg border border-(--color-borde) px-4 py-4"
      onSubmit={(e) => {
        e.preventDefault()
        void guardar()
      }}
    >
      <p className="text-sm text-(--color-tenue)">
        Editar crea la versión {version + 1}, sin costo. Podés corregir el texto y quitar ítems; los datos de origen no se pueden cambiar.
      </p>
      <label className="block text-sm">
        Resumen
        <textarea className={campo} rows={3} maxLength={LIMITES_V4.resumen} value={a.resumen} onChange={(e) => setA({ ...a, resumen: e.target.value })} />
      </label>

      {(Object.keys(TITULOS) as ListaItems[]).map((l) =>
        a[l].length === 0 ? null : (
          <fieldset key={l} className="space-y-3">
            <legend className="text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">{TITULOS[l]}</legend>
            {a[l].map((x, i) => (
              <div key={i} className="space-y-2 rounded-md border border-(--color-borde) p-3">
                <label className="block text-sm">
                  {TITULOS[l]} {i + 1}: qué hacer
                  <textarea className={campo} rows={2} maxLength={LIMITES_V4.accion} value={x.accion} onChange={(e) => cambiarItem(l, i, { accion: e.target.value })} />
                </label>
                <label className="block text-sm">
                  {TITULOS[l]} {i + 1}: porqué
                  <textarea className={campo} rows={2} maxLength={LIMITES_V4.porque} value={x.porque} onChange={(e) => cambiarItem(l, i, { porque: e.target.value })} />
                </label>
                <button type="button" className={boton} onClick={() => quitarItem(l, i)}>
                  Quitar {TITULOS[l]} {i + 1}
                </button>
              </div>
            ))}
          </fieldset>
        ),
      )}

      {a.ideas.length > 0 && (
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">Ideas para armar</legend>
          {a.ideas.map((x, i) => (
            <div key={i} className="space-y-2 rounded-md border border-(--color-borde) p-3">
              <label className="block text-sm">
                Idea {i + 1}: título
                <input className={campo} maxLength={LIMITES_V4.titulo} value={x.titulo} onChange={(e) => cambiarIdea(i, { titulo: e.target.value })} />
              </label>
              <label className="block text-sm">
                Idea {i + 1}: cuándo
                <input className={campo} maxLength={LIMITES_V4.momento} value={x.momento} onChange={(e) => cambiarIdea(i, { momento: e.target.value })} />
              </label>
              <label className="block text-sm">
                Idea {i + 1}: porqué
                <textarea className={campo} rows={2} maxLength={LIMITES_V4.porque} value={x.porque} onChange={(e) => cambiarIdea(i, { porque: e.target.value })} />
              </label>
              <button type="button" className={boton} onClick={() => setA({ ...a, ideas: a.ideas.filter((_, j) => j !== i) })}>
                Quitar idea {i + 1}
              </button>
            </div>
          ))}
        </fieldset>
      )}

      {sinItems && <p className="text-sm text-(--color-tenue)">Dejá al menos un ítem en Hacé, Evitá o Probá.</p>}
      {error && (
        <p role="alert" className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={boton} disabled={cargando || sinItems || resumenVacio}>
          Guardar como versión {version + 1}
        </button>
        <button type="button" className={boton} onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
