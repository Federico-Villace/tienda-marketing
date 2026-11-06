'use client'

import { useState, type ReactNode } from 'react'
import { Costo } from '@/components/costo'
import { buscarMotor } from '@/lib/creativos/motores'
import { esFondoImagen, OPCIONES_FONDO } from '@/lib/imagenes/fondos'
import { rotularVersiones } from '@/lib/imagenes/versiones'
import type { CreativoVista, VersionImagen } from '@/lib/productor/pantalla'
import { tarjetaOpcion } from '@/components/promocion/ui'
import { EnlaceDescarga } from '@/components/ui/enlace-descarga'
import { ImagenAmpliable } from '@/components/ui/lightbox'
import { CompararVersiones, type ImagenAComparar } from './comparar-versiones'

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
  ampliar = true,
  comparar = true,
}: {
  versiones: readonly VersionImagen[]
  alt: (creativo: CreativoVista, indice: number) => string
  usar: UsarImagen
  puedeEditar: boolean
  insignia?: (version: VersionImagen) => string | undefined
  vacio?: string
  /** Lo que va bajo cada imagen (p. ej. "Pedile un cambio"). */
  accionesDe?: (creativo: CreativoVista, version: VersionImagen) => ReactNode
  /** Tocar la imagen la abre grande. */
  ampliar?: boolean
  /** Marcar dos imágenes para verlas juntas. */
  comparar?: boolean
}) {
  // Las dos marcadas para comparar, la más vieja primero: marcar una tercera saca la más vieja.
  const [marcadas, setMarcadas] = useState<string[]>([])
  const [comparando, setComparando] = useState(false)
  if (versiones.length === 0) return vacio ? <p className="text-sm text-(--color-tenue)">{vacio}</p> : null
  let indice = 0
  const todas = versiones.flatMap((v) => v.creativos).filter((c): c is CreativoVista & { url: string } => c.url !== null)
  const aComparar = marcadas.map((id) => {
    const c = todas.find((x) => x.id === id)
    if (!c) return null
    const pos = versiones.flatMap((v) => v.creativos).findIndex((x) => x.id === id)
    return { id, url: c.url, alt: alt(c, pos), rotulo: `Imagen #${c.orden}` } satisfies ImagenAComparar
  })
  const par = aComparar.length === 2 && aComparar[0] && aComparar[1] ? ([aComparar[0], aComparar[1]] as const) : null
  const marcar = (id: string) => setMarcadas((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id].slice(-2)))
  const rotulos = rotularVersiones(versiones)
  // Con una versión ya en uso, elegir otra es "volver" a una anterior.
  const hayEnUso = usar.modo === 'radio' && usar.elegidoId !== null && versiones.some((x) => x.creativos.some((c) => c.id === usar.elegidoId))
  return (
    <div className="space-y-6" data-testid="versiones-imagen">
      {comparar && todas.length >= 2 && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-(--color-tenue)">
          <span>Marcá dos imágenes con «Comparar» para verlas juntas.</span>
          <button type="button" disabled={!par} onClick={() => setComparando(true)} className="inline-flex min-h-11 items-center rounded-md border border-(--color-borde) px-3 text-sm text-current hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50">
            Ver las dos juntas
          </button>
        </div>
      )}
      {versiones.map((v) => {
        const g = v.generacion
        const etiqueta = insignia?.(v)
        return (
          <section key={g.id} aria-label={`Generación ${fecha(g.creadoEn)}`} className="space-y-2">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-(--color-tenue)">
              <span className="rounded-full border border-(--color-borde) px-2 py-0.5 font-medium text-current">{rotulos.get(g.id)}</span>
              {etiqueta && <span className="rounded-full border border-(--color-borde) px-2 py-0.5 font-medium text-current">{etiqueta}</span>}
              <span>{fecha(g.creadoEn)}</span>
              {g.edicion && esFondoImagen(g.edicion) && <span>{OPCIONES_FONDO[g.edicion].nombre}</span>}
              {g.edicion === 'promocion' && <span>Para una promoción</span>}
              <span>{buscarMotor(g.motor)?.nombre ?? g.motor}</span>
              <span>
                {g.cantidad} {g.cantidad === 1 ? 'imagen' : 'imágenes'}
              </span>
              {g.costoRealUsd !== null ? <span>Costo real: <Costo usd={g.costoRealUsd} /></span> : <span>Estimado: <Costo usd={g.costoEstimadoUsd} estimado /></span>}
              {g.interrumpida && (
                <span role="status" className="text-(--color-aviso)">
                  Generación interrumpida: el gasto cuenta por el estimado.
                </span>
              )}
              {g.error && <span>{g.error}</span>}
            </p>
            {v.cambio && v.cambio.sobreOrden !== null && <p className="text-xs text-(--color-tenue)">Cambio pedido sobre la imagen #{v.cambio.sobreOrden}</p>}
            <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible">
              {v.creativos.map((c) => {
                const n = ++indice
                const elegida = usar.modo === 'radio' ? usar.elegidoId === c.id : c.elegida
                return (
                  <li key={c.id} className={`shrink-0 basis-[80%] snap-start rounded-lg border px-2 py-2 sm:basis-[45%] lg:basis-auto ${elegida ? 'border-(--color-ok)' : 'border-(--color-borde)'}`}>
                    {c.url ? (
                      ampliar ? <ImagenAmpliable src={c.url} alt={alt(c, n - 1)} loading="lazy" /> : <img src={c.url} alt={alt(c, n - 1)} loading="lazy" className="w-full rounded-md" />
                    ) : (
                      <p role="note" className="rounded-md border border-dashed border-(--color-falta) px-2 py-6 text-center text-xs">
                        {c.error ?? 'Sin imagen'}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-(--color-tenue)">
                      <span>
                        #{c.orden} · <Costo usd={c.costoUsd} />
                      </span>
                      {usar.modo === 'radio' && elegida && <span className="font-semibold text-(--color-ok)">En uso</span>}
                      {usar.modo === 'boton' && c.elegida && <span className="font-semibold text-(--color-ok)">Elegida</span>}
                    </div>
                    {c.url && usar.modo === 'radio' && (
                      <label className={`${tarjetaOpcion} mt-2`}>
                        <input type="radio" name="escena" checked={elegida} disabled={usar.bloqueado || !puedeEditar} onChange={() => usar.alElegir(c.id)} />
                        <span>{hayEnUso && !elegida ? 'Volver a esta versión · Gratis' : 'Usar esta imagen · Gratis'}</span>
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
                    {c.url && comparar && (
                      <label className="mt-2 flex min-h-11 items-center gap-2 text-xs">
                        <input type="checkbox" checked={marcadas.includes(c.id)} onChange={() => marcar(c.id)} aria-label={`Comparar la imagen ${c.orden}`} />
                        Comparar
                      </label>
                    )}
                    {c.url && (
                      <EnlaceDescarga href={urlParaDescargar(c.url)} nombre={NOMBRE_DESCARGA} className="mt-2 block text-xs underline hover:opacity-70">
                        Descargar
                      </EnlaceDescarga>
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
      <CompararVersiones imagenes={comparando ? par : null} alCerrar={() => setComparando(false)} />
    </div>
  )
}
