'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PedirCambioImagen } from '@/components/imagenes/pedir-cambio-imagen'
import { VersionesImagen } from '@/components/imagenes/versiones-imagen'
import { versionesDeImagen, type CreativoVista, type GeneracionVista } from '@/lib/productor/pantalla'
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
  cambio,
}: {
  pieza: ContenidoGaleria
  puedeEditar: boolean
  elegible?: boolean
  /** Origen de la imagen ("Desde foto" / "Desde texto") para la galería unificada. */
  insignia?: string
  /** Para "Pedile un cambio": sin esto no se ofrece. */
  cambio?: { apagado: string | null; topeUsd: number | null; gastadoUsd: number }
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
      <VersionesImagen
        versiones={versionesDeImagen(pieza.generaciones, pieza.creativos)}
        alt={() => pieza.pieza.altText ?? ''}
        puedeEditar={puedeEditar}
        insignia={() => insignia}
        accionesDe={(c, v) =>
          // Las imágenes de una promoción se cambian desde la promoción (ahí se guardan y se usan).
          cambio && c.url && v.generacion.edicion !== 'promocion' ? (
            <PedirCambioImagen creativoId={c.id} puedeEditar={puedeEditar} apagado={cambio.apagado} topeUsd={cambio.topeUsd} gastadoUsd={cambio.gastadoUsd} />
          ) : null
        }
        usar={
          elegible
            ? { modo: 'boton', alAlternar: (id, elegida) => void elegir(id, elegida), bloqueado: pendiente !== null }
            : { modo: 'ninguno', leyenda: 'Usar en una publicación llega en la próxima etapa.' }
        }
      />
    </div>
  )
}
