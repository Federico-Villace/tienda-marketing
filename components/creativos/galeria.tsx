'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatearUsd } from '@/lib/estratega/formato'
import type { PiezaImagenVista } from '@/lib/productor/pantalla'
import { patchCreativo } from './api'

/**
 * Las imágenes de una pieza, agrupadas por generación. El lector solo mira.
 *
 * Se usa <img> y no next/image a propósito: las URLs son firmadas, de vida
 * corta y apuntan a un dominio remoto de Supabase. next/image exigiría
 * configurar remotePatterns y haría pasar cada URL con token por el optimizador
 * (que la cachearía). Con <img> el navegador la pide directo, sin configuración.
 */
export function Galeria({ pieza, puedeEditar }: { pieza: PiezaImagenVista; puedeEditar: boolean }) {
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
            <span>{g.creadoEn.slice(0, 16).replace('T', ' ')}</span>
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
                  {puedeEditar && c.url && (
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
        </section>
      ))}
    </div>
  )
}
