'use client'

import type { ReactNode } from 'react'
import { formatearUsd } from '@/lib/estratega/formato'
import { esFondoImagen, OPCIONES_FONDO } from '@/lib/imagenes/fondos'
import type { CreativoVista, VersionImagen } from '@/lib/productor/pantalla'
import { tarjetaOpcion } from '@/components/promocion/ui'

/** Cómo se "usa" una imagen en cada lugar. Promociones elige UNA entre todas; las piezas marcan una como elegida. */
export type UsarImagen =
  | { modo: 'radio'; elegidoId: string | null; alElegir: (creativoId: string) => void; bloqueado: boolean }
  | { modo: 'boton'; alAlternar: (creativoId: string, elegida: boolean) => void; bloqueado: boolean }
  /** Una acción con nombre propio (p. ej. "Usar esta imagen en las 3"), con un dato aparte por imagen. */
  | { modo: 'accion'; etiqueta: string; alUsar: (creativoId: string) => void; bloqueado: boolean; dato?: (creativo: CreativoVista) => string }
  | { modo: 'ninguno'; leyenda?: string }

export const NOMBRE_DESCARGA = 'imagen-999motos.jpg'

/** El mismo link firmado, pero que el navegador baja (Supabase lo acepta como parámetro, sin volver a firmar). */
export const urlParaDescargar = (url: string): string => `${url}${url.includes('?') ? '&' : '?'}download=${encodeURIComponent(NOMBRE_DESCARGA)}`

const fecha = (iso: string) => iso.slice(0, 16).replace('T', ' ')

/**
 * Las imágenes de un ítem, una tarjeta por generación (versión). Es la misma grilla en Promociones y
 * en /creativos: fecha, fondo, motor, costo, y si fue un cambio, qué se pidió y sobre cuál imagen.
 * Cada imagen se puede usar, descargar y (donde corresponda) pedirle un cambio.
 *
 * Se usa <img> y no next/image a propósito: las URLs son firmadas, de vida corta y de un dominio remoto.
 */
export function VersionesImagen({
  versiones,
  alt,
  usar,
  puedeEditar,
  insignia,
  vacio = 'Todavía no se generó ninguna imagen.',
  accionesDe,
}: {
  versiones: readonly VersionImagen[]
  alt: (creativo: CreativoVista, indice: number) => string
  usar: UsarImagen
  puedeEditar: boolean
  insignia?: (version: VersionImagen) => string | undefined
  vacio?: string
  /** Lo que va bajo cada imagen (p. ej. "Pedile un cambio"). */
  accionesDe?: (creativo: CreativoVista, version: VersionImagen) => ReactNode
}) {
  if (versiones.length === 0) return vacio ? <p className="text-sm text-(--color-tenue)">{vacio}</p> : null
  let indice = 0
  return (
    <div className="space-y-6" data-testid="versiones-imagen">
      {versiones.map((v) => {
        const g = v.generacion
        const etiqueta = insignia?.(v)
        return (
          <section key={g.id} aria-label={`Generación ${fecha(g.creadoEn)}`} className="space-y-2">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-(--color-tenue)">
              {etiqueta && <span className="rounded-full border border-(--color-borde) px-2 py-0.5 font-medium text-current">{etiqueta}</span>}
              <span>{fecha(g.creadoEn)}</span>
              {g.edicion && esFondoImagen(g.edicion) && <span>{OPCIONES_FONDO[g.edicion].nombre}</span>}
              {g.edicion === 'promocion' && <span>Para una promoción</span>}
              <span className="font-mono">{g.motor}</span>
              <span>
                {g.cantidad} {g.cantidad === 1 ? 'imagen' : 'imágenes'}
              </span>
              {g.costoRealUsd !== null ? <span>Costo real: {formatearUsd(g.costoRealUsd)}</span> : <span>Estimado: {formatearUsd(g.costoEstimadoUsd)}</span>}
              {g.interrumpida && (
                <span role="status" className="text-(--color-aviso)">
                  Generación interrumpida: el gasto cuenta por el estimado.
                </span>
              )}
              {g.error && <span>{g.error}</span>}
            </p>
            {v.cambio && (
              <p className="text-xs">
                <span className="rounded-full border border-(--color-ok) px-2 py-0.5">Cambio: «{v.cambio.instruccion}»</span>
                {v.cambio.sobreOrden !== null && <span className="ml-2 text-(--color-tenue)">sobre la imagen #{v.cambio.sobreOrden}</span>}
              </p>
            )}
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {v.creativos.map((c) => {
                const n = ++indice
                const elegida = usar.modo === 'radio' ? usar.elegidoId === c.id : c.elegida
                return (
                  <li key={c.id} className={`rounded-lg border px-2 py-2 ${elegida ? 'border-(--color-ok)' : 'border-(--color-borde)'}`}>
                    {c.url ? (
                      <img src={c.url} alt={alt(c, n - 1)} loading="lazy" className="w-full rounded-md" />
                    ) : (
                      <p role="note" className="rounded-md border border-dashed border-(--color-falta) px-2 py-6 text-center text-xs">
                        {c.error ?? 'Sin imagen'}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-(--color-tenue)">
                      <span>
                        #{c.orden} · {formatearUsd(c.costoUsd)}
                      </span>
                      {usar.modo === 'radio' && elegida && <span className="font-semibold text-(--color-ok)">En uso</span>}
                      {usar.modo === 'boton' && c.elegida && <span className="font-semibold text-(--color-ok)">Elegida</span>}
                    </div>
                    {c.url && usar.modo === 'radio' && (
                      <label className={`${tarjetaOpcion} mt-2`}>
                        <input type="radio" name="escena" checked={elegida} disabled={usar.bloqueado || !puedeEditar} onChange={() => usar.alElegir(c.id)} />
                        <span>Usar esta imagen</span>
                      </label>
                    )}
                    {c.url && usar.modo === 'accion' && (
                      <>
                        {usar.dato && <p className="mt-1 text-xs text-(--color-tenue)">{usar.dato(c)}</p>}
                        <button
                          type="button"
                          disabled={usar.bloqueado || !puedeEditar}
                          onClick={() => usar.alUsar(c.id)}
                          className="mt-2 w-full rounded-md border border-(--color-borde) px-2 py-1 text-xs hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {usar.etiqueta}
                        </button>
                      </>
                    )}
                    {c.url && usar.modo === 'boton' && puedeEditar && (
                      <button
                        type="button"
                        disabled={usar.bloqueado}
                        onClick={() => usar.alAlternar(c.id, !c.elegida)}
                        aria-label={c.elegida ? `Dejar de usar la imagen ${c.orden}` : `Usar esta imagen ${c.orden}`}
                        className="mt-2 w-full rounded-md border border-(--color-borde) px-2 py-1 text-xs hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {c.elegida ? 'Dejar de usar' : 'Usar esta imagen'}
                      </button>
                    )}
                    {c.url && (
                      <a href={urlParaDescargar(c.url)} download={NOMBRE_DESCARGA} className="mt-2 block text-xs underline hover:opacity-70">
                        Descargar
                      </a>
                    )}
                    {accionesDe?.(c, v)}
                  </li>
                )
              })}
            </ul>
            {usar.modo === 'ninguno' && usar.leyenda && <p className="text-xs text-(--color-tenue)">{usar.leyenda}</p>}
          </section>
        )
      })}
    </div>
  )
}
