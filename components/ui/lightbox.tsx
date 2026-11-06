'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Un diálogo a pantalla casi completa para mirar una imagen grande (zoom con pellizco en el
 * celu). Usa el <dialog> nativo: trae el foco atrapado, Esc y el fondo gratis, sin dependencias.
 * Abrir y cerrar no cuesta nada ni llama a nadie.
 */
export function Lightbox({ abierto, alCerrar, titulo, children }: { abierto: boolean; alCerrar: () => void; titulo: string; children: ReactNode }) {
  const dialogo = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = dialogo.current
    if (!abierto || !d) return
    if (typeof d.showModal === 'function') {
      if (!d.open) d.showModal()
    } else d.setAttribute('open', '')
  }, [abierto])

  if (!abierto) return null
  return (
    <dialog
      ref={dialogo}
      aria-label={titulo}
      // Esc: lo cierra el estado, no el navegador (así el foco y el montaje quedan en un solo lugar).
      onCancel={(e) => {
        e.preventDefault()
        alCerrar()
      }}
      // Un click en el fondo (el propio <dialog>, no su contenido) cierra.
      onClick={(e) => e.target === e.currentTarget && alCerrar()}
      className="m-auto max-h-[95dvh] w-[min(96vw,1100px)] overflow-auto rounded-lg border border-(--color-borde) bg-(--color-papel) p-3 text-(--color-tinta) backdrop:bg-black/70"
    >
      <div className="flex min-w-0 flex-col gap-3">
        <button type="button" onClick={alCerrar} className="inline-flex min-h-11 items-center self-end rounded-md border border-(--color-borde) px-4 text-sm hover:opacity-70">
          Cerrar
        </button>
        {children}
      </div>
    </dialog>
  )
}

/** Una imagen que se puede ampliar: el botón la envuelve y, al cerrar, el foco vuelve a él. */
export function ImagenAmpliable({ src, alt, className = '', loading }: { src: string; alt: string; className?: string; loading?: 'lazy' }) {
  const [abierto, setAbierto] = useState(false)
  const boton = useRef<HTMLButtonElement>(null)
  const cerrar = () => {
    setAbierto(false)
    boton.current?.focus()
  }
  return (
    <>
      <button ref={boton} type="button" onClick={() => setAbierto(true)} aria-label={`Ampliar: ${alt}`} className="block w-full cursor-zoom-in">
        <img src={src} alt={alt} {...(loading ? { loading } : {})} className={`w-full rounded-md ${className}`} />
      </button>
      <Lightbox abierto={abierto} alCerrar={cerrar} titulo={alt}>
        <img src={src} alt={alt} className="mx-auto max-h-[85dvh] w-auto max-w-full touch-pinch-zoom object-contain" />
      </Lightbox>
    </>
  )
}
