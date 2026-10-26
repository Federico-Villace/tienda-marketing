'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LIMITES, textoPublicado } from '@/lib/contenidista/limites'
import { tienePrecioPendiente } from '@/lib/contenidista/montos'
import type { GrupoPieza } from '@/lib/contenidista/pantalla'
import type { EstadoPieza, Pieza as PiezaTexto, PiezaVista } from '@/lib/contenidista/tipos'
import { patchPieza } from './api'

export const ROTULO_ESTADO: Record<EstadoPieza, string> = {
  borrador: 'Borrador',
  aprobada: 'Aprobada',
  descartada: 'Descartada',
  reemplazada: 'Reemplazada',
}

const MENSAJE_409 = 'Se recargó la pantalla porque otra persona cambió esta pieza.'
const boton =
  'rounded-md border border-(--color-borde) px-3 py-1.5 text-sm hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50'
const campo = 'mt-1 block w-full rounded-md border border-(--color-borde) bg-transparent px-2 py-1 text-sm'
const rotulo = 'text-xs tracking-wide text-(--color-tenue) uppercase'

const llevaGuion = (p: PiezaTexto) => p.formato === 'reel' || p.formato === 'video'
const llevaAlt = (p: PiezaTexto) => p.formato === 'imagen' || p.formato === 'carrusel'

/** Hashtags escritos a mano: separados por espacio o coma, con # aunque falte. */
const aHashtags = (t: string): string[] =>
  t.split(/[\s,]+/).filter(Boolean).map((h) => (h.startsWith('#') ? h : `#${h}`))

function Contador({ n, max }: { n: number; max: number }) {
  return (
    <span className={`text-xs tabular-nums ${n > max ? 'font-semibold text-(--color-falta)' : 'text-(--color-tenue)'}`}>
      {n}/{max}
    </span>
  )
}

/**
 * Una pieza: la última versión con sus contadores, Aprobar / Editar / Descartar y el
 * historial de versiones. El rol solo decide qué botones se ven: el endpoint
 * sigue siendo la autoridad (un lector igual recibiría 403).
 */
export function Pieza({ grupo, puedeEditar, marcas }: { grupo: GrupoPieza; puedeEditar: boolean; marcas: readonly string[] }) {
  const router = useRouter()
  const { punta } = grupo
  const p = punta.pieza
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  // El estado se actualiza después del render: la ref corta un doble click inmediato.
  const enCurso = useRef(false)

  const accionable = puedeEditar && (punta.estado === 'borrador' || punta.estado === 'aprobada')

  async function actuar(accion: 'aprobar' | 'descartar') {
    if (enCurso.current) return
    enCurso.current = true
    setCargando(true)
    setError(null)
    const r = await patchPieza(punta.id, { accion, version: punta.version })
    enCurso.current = false
    setCargando(false)
    if (r.ok) {
      router.refresh()
      return
    }
    // 409: alguien más cambió la pieza; se recarga para mostrar lo vigente.
    setError(r.status === 409 ? MENSAJE_409 : r.error)
    if (r.status === 409) router.refresh()
  }

  return (
    <article className={`space-y-3 rounded-lg border border-(--color-borde) px-4 py-3 ${punta.estado === 'descartada' ? 'opacity-60' : ''}`}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-(--color-tenue)">
        <span className="font-mono">v{punta.version}</span>
        <span className="rounded-full border border-(--color-borde) px-2 py-0.5">{ROTULO_ESTADO[punta.estado]}</span>
        <span>{`${p.marca} · ${p.plataforma} · ${p.formato} · ${p.fecha}`}</span>
        {tienePrecioPendiente(p) && (
          <span className="rounded-full border border-(--color-aviso) px-2 py-0.5 text-(--color-aviso)">precio a completar</span>
        )}
      </header>

      <p className="font-medium">{p.hook}</p>
      {p.copy !== '' && (
        <div>
          <p className="text-sm whitespace-pre-line">{p.copy}</p>
          <Contador n={textoPublicado(p).length} max={LIMITES.COPY} />
        </div>
      )}
      {p.hashtags.length > 0 && (
        <p className="text-sm text-(--color-tenue)">
          {p.hashtags.join(' ')} <Contador n={p.hashtags.length} max={LIMITES.HASHTAGS} />
        </p>
      )}
      <p className="text-sm">
        <span className={rotulo}>CTA </span>
        {p.cta}
      </p>
      {p.guion && (
        <div>
          <p className={rotulo}>Guion</p>
          <p className="text-sm whitespace-pre-line">{p.guion}</p>
        </div>
      )}
      <div>
        <p className={rotulo}>Brief visual</p>
        <p className="text-sm">{p.briefVisual}</p>
      </div>
      {p.altText && (
        <div>
          <p className={rotulo}>Texto alternativo</p>
          <p className="text-sm">{p.altText}</p>
          <Contador n={p.altText.length} max={LIMITES.ALT} />
        </div>
      )}

      {accionable && (
        <div className="flex flex-wrap gap-2">
          {punta.estado === 'borrador' && (
            <button type="button" className={boton} disabled={cargando} onClick={() => actuar('aprobar')}>
              Aprobar
            </button>
          )}
          <button type="button" className={boton} disabled={cargando} onClick={() => setEditando(true)}>
            Editar
          </button>
          {punta.estado === 'borrador' && (
            <button type="button" className={boton} disabled={cargando} onClick={() => actuar('descartar')}>
              Descartar
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">
          {error}
        </p>
      )}
      {editando && <Editor punta={punta} marcas={marcas} onCerrar={() => setEditando(false)} />}

      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-(--color-tenue)">
          Versiones ({grupo.versiones.length})
        </summary>
        <ul aria-label="Versiones" className="mt-2 space-y-1">
          {grupo.versiones.map((v) => (
            <li key={v.id} className="flex flex-wrap gap-x-4 text-xs text-(--color-tenue)">
              <span className="font-mono">v{v.version}</span>
              <span>{v.origen === 'agente' ? 'Agente' : 'Edición'}</span>
              <span>{ROTULO_ESTADO[v.estado]}</span>
              <span className="ml-auto tabular-nums">{v.creadoEn.slice(0, 16).replace('T', ' ')}</span>
            </li>
          ))}
        </ul>
      </details>
    </article>
  )
}

/**
 * Edición inline sobre estado local. Guardar crea una versión nueva (US$ 0):
 * la validación real la hace el endpoint con validarPieza y sus errores se
 * muestran acá.
 */
function Editor({ punta, marcas, onCerrar }: { punta: PiezaVista; marcas: readonly string[]; onCerrar: () => void }) {
  const router = useRouter()
  const base = punta.pieza
  const esHistoria = base.formato === 'historia'
  const [marca, setMarca] = useState(base.marca)
  const [fecha, setFecha] = useState(base.fecha)
  const [hook, setHook] = useState(base.hook)
  const [copy, setCopy] = useState(base.copy)
  const [hashtags, setHashtags] = useState(base.hashtags.join(' '))
  const [cta, setCta] = useState(base.cta)
  const [guion, setGuion] = useState(base.guion ?? '')
  const [briefVisual, setBriefVisual] = useState(base.briefVisual)
  const [altText, setAltText] = useState(base.altText ?? '')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errores, setErrores] = useState<string[]>([])
  const enCurso = useRef(false)

  const tags = esHistoria ? [] : aHashtags(hashtags)

  async function guardar() {
    if (enCurso.current) return
    enCurso.current = true
    setCargando(true)
    setError(null)
    setErrores([])
    const pieza: PiezaTexto = {
      ...base,
      marca,
      fecha,
      hook,
      copy: esHistoria ? '' : copy,
      hashtags: tags,
      cta,
      guion: llevaGuion(base) ? guion : null,
      briefVisual,
      altText: llevaAlt(base) ? altText : null,
    }
    const r = await patchPieza(punta.id, { pieza, version: punta.version })
    enCurso.current = false
    setCargando(false)
    if (r.ok) {
      router.refresh()
      onCerrar()
      return
    }
    setError(r.status === 409 ? MENSAJE_409 : r.error)
    setErrores(r.errores)
    if (r.status === 409) router.refresh()
  }

  return (
    <form
      className="space-y-3 rounded-lg border border-(--color-borde) px-4 py-4"
      onSubmit={(e) => {
        e.preventDefault()
        void guardar()
      }}
    >
      <p className="text-sm text-(--color-tenue)">
        Editar crea la versión {punta.version + 1}, sin costo. La anterior queda en el historial.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Marca
          <select aria-label="Marca" className={campo} value={marca} onChange={(e) => setMarca(e.target.value)}>
            {marcas.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Fecha
          <input type="date" aria-label="Fecha" className={campo} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
      </div>

      <div>
        <label className="block text-sm">
          Hook
          <input aria-label="Hook" className={campo} value={hook} onChange={(e) => setHook(e.target.value)} />
        </label>
        <Contador n={hook.length} max={LIMITES.HOOK} />
      </div>

      {!esHistoria && (
        <>
          <div>
            <label className="block text-sm">
              Copy
              <textarea aria-label="Copy" className={campo} rows={5} value={copy} onChange={(e) => setCopy(e.target.value)} />
            </label>
            <Contador n={textoPublicado({ copy, hashtags: tags }).length} max={LIMITES.COPY} />
          </div>
          <div>
            <label className="block text-sm">
              Hashtags
              <input aria-label="Hashtags" className={campo} value={hashtags} onChange={(e) => setHashtags(e.target.value)} />
            </label>
            <Contador n={tags.length} max={LIMITES.HASHTAGS} />
          </div>
        </>
      )}

      <div>
        <label className="block text-sm">
          CTA
          <input aria-label="CTA" className={campo} value={cta} onChange={(e) => setCta(e.target.value)} />
        </label>
        <Contador n={cta.length} max={LIMITES.CTA} />
      </div>

      {llevaGuion(base) && (
        <div>
          <label className="block text-sm">
            Guion
            <textarea aria-label="Guion" className={campo} rows={4} value={guion} onChange={(e) => setGuion(e.target.value)} />
          </label>
          <Contador n={guion.length} max={LIMITES.GUION} />
        </div>
      )}

      <div>
        <label className="block text-sm">
          Brief visual
          <textarea aria-label="Brief visual" className={campo} rows={2} value={briefVisual} onChange={(e) => setBriefVisual(e.target.value)} />
        </label>
        <Contador n={briefVisual.length} max={LIMITES.BRIEF_VISUAL} />
      </div>

      {llevaAlt(base) && (
        <div>
          <label className="block text-sm">
            Texto alternativo
            <textarea aria-label="Texto alternativo" className={campo} rows={2} value={altText} onChange={(e) => setAltText(e.target.value)} />
          </label>
          <Contador n={altText.length} max={LIMITES.ALT} />
        </div>
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

      <div className="flex flex-wrap gap-2">
        <button type="submit" className={boton} disabled={cargando}>
          Guardar como versión {punta.version + 1}
        </button>
        <button type="button" className={boton} onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
