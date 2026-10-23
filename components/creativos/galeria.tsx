'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatearUsd } from '@/lib/estratega/formato'
import { EDICIONES_FOTO, esEdicion } from '@/lib/productor/ediciones'
import type { CreativoVista, GeneracionVista } from '@/lib/productor/pantalla'
import { patchCreativo } from './api'

/**
 * Las imágenes de una pieza, agrupadas por generación. El lector solo mira.
 *
 * Se usa <img> y no next/image a propósito: las URLs son firmadas, de vida
 * corta y apuntan a un dominio remoto de Supabase. next/image exigiría
 * configurar remotePatterns y haría pasar cada URL con token por el optimizador
 * (que la cachearía). Con <img> el navegador la pide directo, sin configuración.
 */
export type ContenidoGaleria = {
  pieza: { altText?: string | null }
  generaciones: readonly GeneracionVista[]
  creativos: readonly CreativoVista[]
}

/**
 * `elegible=false` oculta Elegir: las imágenes de una foto no se eligen todavía
 * (la "elegida" sirve para publicar una pieza, y una foto no es una pieza).
 */
export function Galeria({
  pieza,
  puedeEditar,
  elegible = true,
  insignia,
}: {
  pieza: ContenidoGaleria
  puedeEditar: boolean
  elegible?: boolean
  /** Origen de la imagen ("Desde foto" / "Desde texto") para la galería unificada. */
  insignia?: string
}) {
  const router = useRouter()
  const [pendiente, setPendiente] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const enCurso = useRef(false)

  async function elegir(id: string, elegida: boolean) {
    if (enCurso.current) return
    enCurso.current = true
    setPendiente(id)
    setError(null)
    const r = await patchCreativo(id, elegida)
    enCurso.current = false
    setPendiente(null)
    if (!r.ok) {
      setError(r.error)
      return
    }
    router.refresh()
  }

  if (pieza.generaciones.length === 0) {
    return <p className="text-sm text-(--color-tenue)">Todavía no se generó ninguna imagen de esta pieza.</p>
  }

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">
          {error}
        </p>
      )}
      {pieza.generaciones.map((g) => (
        <section key={g.id} aria-label={`Generación ${g.creadoEn.slice(0, 16).replace('T', ' ')}`} className="space-y-2">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-(--color-tenue)">
            {insignia && (
              <span className="rounded-full border border-(--color-borde) px-2 py-0.5 font-medium text-current">{insignia}</span>
            )}
            <span>{g.creadoEn.slice(0, 16).replace('T', ' ')}</span>
            {g.edicion && esEdicion(g.edicion) && <span>{EDICIONES_FOTO[g.edicion].nombre}</span>}
            <span className="font-mono">{g.motor}</span>
            <span>{g.cantidad} {g.cantidad === 1 ? 'imagen' : 'imágenes'}</span>
            {g.costoRealUsd !== null ? (
              <span>Costo real: {formatearUsd(g.costoRealUsd)}</span>
            ) : (
              <span>Estimado: {formatearUsd(g.costoEstimadoUsd)}</span>
            )}
            {g.interrumpida && (
              <span role="status" className="text-(--color-aviso)">
                Generación interrumpida: el gasto cuenta por el estimado.
              </span>
            )}
            {g.error && <span>{g.error}</span>}
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {pieza.creativos
              .filter((c) => c.generacionId === g.id)
              .sort((a, b) => a.orden - b.orden)
              .map((c) => (
                <li key={c.id} className={`rounded-lg border px-2 py-2 ${c.elegida ? 'border-(--color-ok)' : 'border-(--color-borde)'}`}>
                  {c.url ? (
                    <img src={c.url} alt={pieza.pieza.altText ?? ''} loading="lazy" className="w-full rounded-md" />
                  ) : (
                    <p role="note" className="rounded-md border border-dashed border-(--color-falta) px-2 py-6 text-center text-xs">
                      {c.error ?? 'Sin imagen'}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-(--color-tenue)">
                    <span>#{c.orden} · {formatearUsd(c.costoUsd)}</span>
                    {c.elegida && <span className="font-semibold text-(--color-ok)">Elegida</span>}
                  </div>
                  {puedeEditar && elegible && c.url && (
                    <button
                      type="button"
                      disabled={pendiente !== null}
                      onClick={() => void elegir(c.id, !c.elegida)}
                      className="mt-2 w-full rounded-md border border-(--color-borde) px-2 py-1 text-xs hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {c.elegida ? `Quitar la imagen ${c.orden}` : `Elegir la imagen ${c.orden}`}
                    </button>
                  )}
                </li>
              ))}
          </ul>
          {!elegible && (
            <p className="text-xs text-(--color-tenue)">Usar en una publicación llega en la próxima etapa.</p>
          )}
        </section>
      ))}
    </div>
  )
}
